import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getSchemaRefName, normalizeSchemaDocument, normalizeSchemaNode, resolveSchemaPrimaryType, toSchemaObject } from '@yapi-next/shared-types';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { mockExtra } from '../legacy/mock-extra';

type LooseObject = Record<string, unknown>;

type RouteIndex = {
  staticMap: Map<string, InterfaceEntity[]>;
  queryPathMap: Map<string, InterfaceEntity[]>;
  varList: InterfaceEntity[];
};

type MockResolveResult = {
  project: ProjectEntity & LooseObject;
  interfaceData: InterfaceEntity & LooseObject;
  resolvedPath: string;
  query: LooseObject;
  body: LooseObject;
};

export class MockRouteError extends Error {
  constructor(
    readonly errcode: number,
    message: string
  ) {
    super(message);
  }
}

@Injectable()
export class MockService {
  private readonly routeIndexCache = new Map<string, RouteIndex>();
  private mockExtraFn: ((mockJson: unknown, context?: LooseObject) => unknown) | null | undefined;
  private mockJs: { mock: (input: unknown) => unknown } | null | undefined;
  private json5Parser: { parse: (input: string) => unknown } | null | undefined;

  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>
  ) {}

  async resolveAndMock(input: {
    projectId: number;
    method: string;
    path: string;
    query: LooseObject;
    body: unknown;
  }): Promise<MockResolveResult> {
    const project = (await this.projectModel.findOne({ _id: input.projectId }).lean()) as
      | (ProjectEntity & LooseObject)
      | null;
    if (!project) {
      throw new MockRouteError(400, '不存在的项目');
    }

    const method = String(input.method || 'GET').toUpperCase();
    const resolvedPath = this.resolveRequestPath(input.path, String(project.basepath || ''));
    const routeIndex = await this.getRouteIndex(input.projectId, method, Number(project.up_time || 0));
    const query = this.toLooseObject(input.query);
    const body = this.normalizeBody(input.body);
    const match = this.matchInterface(routeIndex, resolvedPath, query);
    if (!match) {
      throw new MockRouteError(
        404,
        `不存在的api, 当前请求path为 ${resolvedPath}， 请求方法为 ${method} ，请确认是否定义此请求。`
      );
    }

    const mergedQuery = {
      ...match.pathParams,
      ...query
    };

    return {
      project,
      interfaceData: match.interfaceData,
      resolvedPath,
      query: mergedQuery,
      body
    };
  }

  buildMockBody(resolved: MockResolveResult): unknown {
    const interfaceData = resolved.interfaceData;
    const resBodyType = String(interfaceData.res_body_type || 'raw').toLowerCase();
    let output: unknown = String(interfaceData.res_body || '');

    if (resBodyType === 'json') {
      if (interfaceData.res_body_is_json_schema === true) {
        const schema = normalizeSchemaDocument(this.parseJsonLoose(interfaceData.res_body, {}));
        output = this.schemaToJson(schema, toSchemaObject(schema.definitions), new Set(), true, 0);
      } else {
        const source = this.parseJsonLoose(interfaceData.res_body, interfaceData.res_body || '');
        const context = {
          query: resolved.query,
          body: resolved.body,
          params: {
            ...resolved.query,
            ...resolved.body
          }
        };
        output = this.applyMockExtra(source, context);
      }
      output = this.applyMockJs(output);
    }

    return output;
  }

  private resolveRequestPath(rawPath: string, projectBasePath: string): string {
    const requestPath = this.ensureSlash(rawPath);
    const basePath = this.normalizeBasePath(projectBasePath);
    if (basePath && requestPath.startsWith(basePath)) {
      const trimmed = requestPath.slice(basePath.length);
      return this.ensureSlash(trimmed || '/');
    }
    return requestPath;
  }

  private async getRouteIndex(
    projectId: number,
    method: string,
    projectVersion: number
  ): Promise<RouteIndex> {
    const cacheKey = `${projectId}:${method}:${projectVersion || 0}`;
    const cached = this.routeIndexCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const stalePrefix = `${projectId}:${method}:`;
    for (const key of this.routeIndexCache.keys()) {
      if (key.startsWith(stalePrefix)) {
        this.routeIndexCache.delete(key);
      }
    }

    const list = (await this.interfaceModel
      .find({
        project_id: projectId,
        method
      })
      .select(
        '_id title path method project_id catid type query_path req_query req_headers req_params req_body_type req_body_form req_body_other req_body_is_json_schema res_body_type res_body res_body_is_json_schema markdown api_opened'
      )
      .lean()) as Array<InterfaceEntity & LooseObject>;

    const staticMap = new Map<string, InterfaceEntity[]>();
    const queryPathMap = new Map<string, InterfaceEntity[]>();
    const varList: InterfaceEntity[] = [];

    list.forEach(item => {
      if (String(item.type || 'static') === 'var') {
        varList.push(item);
        return;
      }

      const routePath = String(item.path || '');
      if (!staticMap.has(routePath)) {
        staticMap.set(routePath, []);
      }
      staticMap.get(routePath)?.push(item);

      const queryPath = this.queryPath(item)?.path;
      if (queryPath) {
        if (!queryPathMap.has(queryPath)) {
          queryPathMap.set(queryPath, []);
        }
        queryPathMap.get(queryPath)?.push(item);
      }
    });

    const index: RouteIndex = {
      staticMap,
      queryPathMap,
      varList
    };
    this.routeIndexCache.set(cacheKey, index);
    return index;
  }

  private matchInterface(
    routeIndex: RouteIndex,
    requestPath: string,
    query: LooseObject
  ): { interfaceData: InterfaceEntity & LooseObject; pathParams: LooseObject } | null {
    const queryPathMatches = routeIndex.queryPathMap.get(requestPath) || [];
    const matchedByQueryPath = this.pickQueryPathMatch(queryPathMatches, query);
    if (matchedByQueryPath) {
      return {
        interfaceData: matchedByQueryPath,
        pathParams: {}
      };
    }

    const staticMatches = routeIndex.staticMap.get(requestPath) || [];
    if (staticMatches.length > 0) {
      return {
        interfaceData: staticMatches[0] as InterfaceEntity & LooseObject,
        pathParams: {}
      };
    }

    let bestWeight = -1;
    let bestInterface: (InterfaceEntity & LooseObject) | null = null;
    let bestParams: LooseObject = {};
    routeIndex.varList.forEach(item => {
      const match = matchApi(requestPath, String(item.path || ''));
      if (!match) return;
      const weight = Number(match.__weight || 0);
      if (weight >= bestWeight) {
        bestWeight = weight;
        bestInterface = item as InterfaceEntity & LooseObject;
        const params: LooseObject = { ...match };
        delete params.__weight;
        bestParams = params;
      }
    });

    if (!bestInterface) return null;
    return {
      interfaceData: bestInterface,
      pathParams: bestParams
    };
  }

  private pickQueryPathMatch(
    candidates: InterfaceEntity[],
    query: LooseObject
  ): (InterfaceEntity & LooseObject) | null {
    for (const item of candidates) {
      const params = this.queryPath(item)?.params || [];
      if (!Array.isArray(params) || params.length === 0) {
        continue;
      }
      let matched = true;
      for (const entry of params) {
        const name = typeof entry?.name === 'string' ? entry.name : '';
        const expected = typeof entry?.value === 'string' ? entry.value : '';
        if (!name) {
          matched = false;
          break;
        }
        const actualRaw = query[name];
        const actual = Array.isArray(actualRaw)
          ? String(actualRaw[0] ?? '')
          : actualRaw == null
            ? ''
            : String(actualRaw);
        if (actual !== expected) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return item as InterfaceEntity & LooseObject;
      }
    }
    return null;
  }

  private queryPath(input: InterfaceEntity | LooseObject): {
    path?: string;
    params?: Array<{ name?: string; value?: string }>;
  } | null {
    const value = (input as LooseObject).query_path;
    if (!value || typeof value !== 'object') return null;
    return value as {
      path?: string;
      params?: Array<{ name?: string; value?: string }>;
    };
  }

  private normalizeBasePath(input: string): string {
    let value = String(input || '').trim();
    if (!value || value === '/') return '';
    if (!value.startsWith('/')) value = '/' + value;
    if (value.endsWith('/')) value = value.slice(0, -1);
    return value;
  }

  private ensureSlash(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  private parseJsonLoose<T>(input: unknown, fallback: T): T {
    if (typeof input !== 'string') {
      return (input as T) ?? fallback;
    }
    const value = input.trim();
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch (_err) {}
    const parser = this.loadJson5();
    if (parser) {
      try {
        return parser.parse(value) as T;
      } catch (_err) {}
    }
    return fallback;
  }

  private loadJson5(): { parse: (input: string) => unknown } | null {
    if (typeof this.json5Parser !== 'undefined') return this.json5Parser;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.json5Parser = require('json5');
      return this.json5Parser ?? null;
    } catch (_err) {
      this.json5Parser = null;
      return null;
    }
  }

  private applyMockExtra(input: unknown, context: LooseObject): unknown {
    const fn = this.loadMockExtra();
    if (!fn) return input;
    try {
      return fn(this.deepClone(input), context);
    } catch (_err) {
      return input;
    }
  }

  private applyMockJs(input: unknown): unknown {
    const mock = this.loadMockJs();
    if (!mock) return input;
    try {
      return mock.mock(input);
    } catch (_err) {
      return input;
    }
  }

  private loadMockExtra(): ((mockJson: unknown, context?: LooseObject) => unknown) | null {
    if (typeof this.mockExtraFn !== 'undefined') return this.mockExtraFn;
    this.mockExtraFn = mockExtra;
    return this.mockExtraFn;
  }

  private loadMockJs(): { mock: (input: unknown) => unknown } | null {
    if (typeof this.mockJs !== 'undefined') return this.mockJs;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require('mockjs');
      if (loaded && typeof loaded.mock === 'function') {
        this.mockJs = loaded;
        return this.mockJs ?? null;
      }
    } catch (_err) {}
    this.mockJs = null;
    return null;
  }

  private normalizeBody(input: unknown): LooseObject {
    if (!input) return {};
    if (typeof input === 'string') {
      return this.parseJsonLoose<LooseObject>(input, {});
    }
    if (typeof input === 'object' && !Array.isArray(input)) {
      return input as LooseObject;
    }
    return {};
  }

  private toLooseObject(input: unknown): LooseObject {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as LooseObject;
    }
    return {};
  }

  private schemaToJson(
    schema: unknown,
    definitions: LooseObject,
    visitedRefs: Set<string>,
    alwaysFakeOptionals: boolean,
    depth: number
  ): unknown {
    if (!schema || typeof schema !== 'object') {
      return null;
    }
    if (depth > 12) {
      return {};
    }

    const node = normalizeSchemaNode(schema as Record<string, unknown>);
    if (typeof node.$ref === 'string') {
      const refName = getSchemaRefName(node.$ref);
      if (!refName || visitedRefs.has(refName)) {
        return {};
      }
      const target = definitions[refName];
      if (!target || typeof target !== 'object') {
        return {};
      }
      const nextVisitedRefs = new Set(visitedRefs);
      nextVisitedRefs.add(refName);
      return this.schemaToJson(target, definitions, nextVisitedRefs, alwaysFakeOptionals, depth + 1);
    }

    if (Object.prototype.hasOwnProperty.call(node, 'example')) {
      return node.example;
    }
    if (Array.isArray(node.enum) && node.enum.length > 0) {
      return node.enum[0];
    }
    if (Object.prototype.hasOwnProperty.call(node, 'default')) {
      return node.default;
    }

    const type = resolveSchemaPrimaryType(node);
    if (type === 'object') {
      const properties = toSchemaObject(node.properties);
      const required = Array.isArray(node.required)
        ? new Set(
            node.required
              .map(item => (typeof item === 'string' ? item : ''))
              .filter(Boolean)
          )
        : new Set<string>();
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        const isRequired = required.has(key);
        if (!alwaysFakeOptionals && !isRequired) continue;
        output[key] = this.schemaToJson(value, definitions, visitedRefs, alwaysFakeOptionals, depth + 1);
      }
      if (node.additionalProperties === true) {
        output.key = '';
      } else if (node.additionalProperties && typeof node.additionalProperties === 'object') {
        output.key = this.schemaToJson(
          node.additionalProperties,
          definitions,
          visitedRefs,
          alwaysFakeOptionals,
          depth + 1
        );
      }
      return output;
    }

    if (type === 'array' || node.items) {
      const itemSchema = node.items;
      if (!itemSchema) return [];
      return [this.schemaToJson(itemSchema, definitions, visitedRefs, alwaysFakeOptionals, depth + 1)];
    }

    if (type === 'integer' || type === 'number') return 0;
    if (type === 'boolean') return true;
    if (type === 'null') return null;
    return '';
  }

  private deepClone<T>(input: T): T {
    if (input == null) return input;
    if (typeof input !== 'object') return input;
    try {
      return JSON.parse(JSON.stringify(input)) as T;
    } catch (_err) {
      return input;
    }
  }
}

function matchApi(apiPath: string, apiRule: string): (LooseObject & { __weight: number }) | false {
  const apiRules = apiRule.split('/');
  const apiPaths = apiPath.split('/');
  const pathParams: LooseObject & { __weight: number } = {
    __weight: 0
  };

  if (apiPaths.length !== apiRules.length) {
    return false;
  }
  for (let i = 0; i < apiRules.length; i++) {
    const currentRule = apiRules[i] ? apiRules[i].trim() : '';
    if (!currentRule) continue;
    if (currentRule.length > 2 && currentRule[0] === '{' && currentRule[currentRule.length - 1] === '}') {
      pathParams[currentRule.substring(1, currentRule.length - 1)] = apiPaths[i];
      continue;
    }
    if (currentRule.startsWith(':')) {
      pathParams[currentRule.substring(1)] = apiPaths[i];
      continue;
    }
    if (currentRule.length > 2 && currentRule.includes('{') && currentRule.includes('}')) {
      const names: string[] = [];
      const pattern = currentRule.replace(/\{(.+?)\}/g, (_src: string, match: string) => {
        names.push(match);
        return '([^\\/\\s]+)';
      });
      const regexp = new RegExp(pattern);
      if (!regexp.test(apiPaths[i])) return false;
      const matches = apiPaths[i].match(regexp);
      names.forEach((name, index) => {
        pathParams[name] = matches?.[index + 1] || '';
      });
      continue;
    }
    if (currentRule !== apiPaths[i]) {
      return false;
    }
    pathParams.__weight += 1;
  }
  return pathParams;
}
