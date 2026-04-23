import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getSchemaRefName, sanitizeSchemaDefinitionName, toSchemaObject } from '@yapi-next/shared-types';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { ProjectEntity } from '../database/schemas/project.schema';

@Injectable()
export class SpecExportService {
  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly catModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>
  ) {}

  async export(params: {
    projectId: number;
    format: 'openapi3' | 'swagger2';
    status: 'all' | 'open';
    catId?: number;
    interfaceId?: number;
  }): Promise<string> {
    const project = await this.projectModel.findOne({ _id: params.projectId }).lean();
    if (!project) {
      throw new Error('项目不存在');
    }
    const option: Record<string, unknown> = {
      project_id: params.projectId
    };
    if (params.status === 'open') {
      option.api_opened = true;
    }
    const interfaceId = Number(params.interfaceId || 0);
    const catId = Number(params.catId || 0);
    let selectedInterfaceCatId = 0;
    if (interfaceId > 0) {
      const targetInterface = await this.interfaceModel.findOne({
        _id: interfaceId,
        project_id: params.projectId
      }).lean();
      if (!targetInterface) {
        throw new Error('接口不存在');
      }
      selectedInterfaceCatId = Number(targetInterface.catid || 0);
      option._id = interfaceId;
    } else if (catId > 0) {
      const targetCat = await this.catModel.findOne({
        _id: catId,
        project_id: params.projectId
      }).lean();
      if (!targetCat) {
        throw new Error('分类不存在');
      }
      option.catid = catId;
    }

    const interfaces = await this.interfaceModel.find(option).sort({ catid: 1, index: 1, title: 1 }).lean();
    const catIds = interfaceId > 0
      ? (selectedInterfaceCatId > 0 ? [selectedInterfaceCatId] : [])
      : catId > 0
        ? [catId]
        : [];
    const catsQuery = catIds.length > 0
      ? { project_id: params.projectId, _id: { $in: catIds } }
      : { project_id: params.projectId };
    const cats = await this.catModel.find(catsQuery).sort({ index: 1, _id: 1 }).lean();

    if (params.format === 'swagger2') {
      return JSON.stringify(this.toSwagger2(project, cats, interfaces), null, 2);
    }
    return JSON.stringify(this.toOpenApi3(project, cats, interfaces), null, 2);
  }

  private toOpenApi3(
    project: ProjectEntity,
    cats: InterfaceCatEntity[],
    interfaces: InterfaceEntity[]
  ): Record<string, unknown> {
    const tagMap = new Map<number, InterfaceCatEntity>();
    cats.forEach(cat => tagMap.set(cat._id, cat));
    const usedOperationIds = new Set<string>();
    const model: Record<string, any> = {
      openapi: '3.0.3',
      info: {
        title: project.name,
        version: 'last',
        description: project.desc || ''
      },
      servers: [
        {
          url: project.basepath || '/'
        }
      ],
      tags: cats.map(cat => ({
        name: cat.name,
        description: cat.desc || cat.name
      })),
      paths: {},
      components: {
        schemas: {}
      }
    };

    interfaces.forEach(api => {
      if (!model.paths[api.path]) {
        model.paths[api.path] = {};
      }
      const method = String(api.method || 'GET').toLowerCase();
      const cat = tagMap.get(api.catid);
      const rawOperation = this.parseJson(api.operation_oas3, null);
      const operation: Record<string, any> = rawOperation && typeof rawOperation === 'object'
        ? rawOperation
        : {
            tags: cat ? [cat.name] : [],
            summary: api.title,
            description: api.markdown || api.desc || '',
            parameters: [],
            responses: {}
          };
      operation.tags = Array.isArray(operation.tags) && operation.tags.length > 0
        ? operation.tags
        : cat
          ? [cat.name]
          : [];
      operation.summary = operation.summary || api.title;
      operation.description = operation.description || api.markdown || api.desc || '';
      operation.parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      operation.responses = operation.responses && typeof operation.responses === 'object'
        ? operation.responses
        : {};
      operation.operationId = this.normalizeOperationId(operation.operationId, method, api.path, usedOperationIds);
      operation['x-yapi-tags'] = Array.isArray(api.tag) ? api.tag : [];
      if (api.import_meta) {
        operation['x-yapi-import-meta'] = this.parseJson(api.import_meta, { raw: api.import_meta });
      }

      this.applyInterfaceDataToOpenApiOperation(operation, api, model.components.schemas);
      model.paths[api.path][method] = operation;
    });

    if (Object.keys(model.components.schemas).length === 0) {
      delete model.components;
    }
    return model;
  }

  private toSwagger2(
    project: ProjectEntity,
    cats: InterfaceCatEntity[],
    interfaces: InterfaceEntity[]
  ): Record<string, unknown> {
    const tagMap = new Map<number, InterfaceCatEntity>();
    cats.forEach(cat => tagMap.set(cat._id, cat));
    const usedOperationIds = new Set<string>();
    const model: Record<string, any> = {
      swagger: '2.0',
      info: {
        title: project.name,
        version: 'last',
        description: project.desc || ''
      },
      basePath: project.basepath || '/',
      schemes: ['http'],
      tags: cats.map(cat => ({
        name: cat.name,
        description: cat.desc || cat.name
      })),
      paths: {},
      definitions: {}
    };

    interfaces.forEach(api => {
      if (!model.paths[api.path]) {
        model.paths[api.path] = {};
      }
      const method = String(api.method || 'GET').toLowerCase();
      const cat = tagMap.get(api.catid);
      const operation: Record<string, any> = {
        tags: cat ? [cat.name] : [],
        summary: api.title,
        description: api.markdown || api.desc || '',
        operationId: this.normalizeOperationId(undefined, method, api.path, usedOperationIds),
        parameters: [],
        responses: {
          '200': {
            description: 'successful operation'
          }
        }
      };

      (api.req_headers || []).forEach((item: any) => {
        if (item.name === 'Content-Type') return;
        operation.parameters.push({
          name: item.name,
          in: 'header',
          description: item.desc || '',
          required: String(item.required) === '1',
          type: 'string'
        });
      });

      (api.req_params || []).forEach((item: any) => {
        operation.parameters.push({
          name: item.name,
          in: 'path',
          description: item.desc || '',
          required: true,
          type: 'string'
        });
      });

      (api.req_query || []).forEach((item: any) => {
        operation.parameters.push({
          name: item.name,
          in: 'query',
          description: item.desc || '',
          required: String(item.required) === '1',
          type: 'string'
        });
      });

      if (api.req_body_type === 'json' && api.req_body_other) {
        operation.parameters.push({
          name: 'root',
          in: 'body',
          schema: this.prepareSchemaForExport(
            api.req_body_other,
            `${operation.operationId}_Request`,
            'swagger2',
            model.definitions
          )
        });
      } else if (api.req_body_type === 'form') {
        (api.req_body_form || []).forEach((item: any) => {
          operation.parameters.push({
            name: item.name,
            in: 'formData',
            description: item.desc || '',
            required: String(item.required) === '1',
            type: item.type === 'file' ? 'file' : 'string'
          });
        });
      }

      if (api.res_body_type === 'json' && api.res_body) {
        operation.responses['200'].schema = this.prepareSchemaForExport(
          api.res_body,
          `${operation.operationId}_Response`,
          'swagger2',
          model.definitions
        );
      } else {
        operation.responses['200'].schema = {
          type: 'string',
          example: api.res_body || ''
        };
      }

      model.paths[api.path][method] = operation;
    });

    if (Object.keys(model.definitions).length === 0) {
      delete model.definitions;
    }
    return model;
  }

  private applyInterfaceDataToOpenApiOperation(
    operation: Record<string, any>,
    api: InterfaceEntity,
    schemaRegistry: Record<string, unknown>
  ): void {
    const originalResponses = operation.responses && typeof operation.responses === 'object'
      ? operation.responses
      : {};
    const originalRequestBody = operation.requestBody && typeof operation.requestBody === 'object'
      ? operation.requestBody
      : null;
    const requestBodyDescription = originalRequestBody?.description;

    operation.parameters = this.buildOpenApiParameters(api);
    operation.responses = {};
    delete operation.requestBody;

    const reqBodyLooksLikeSchema = this.isJsonSchemaLikeText(api.req_body_other);
    if ((api.req_body_type === 'json' || (api.req_body_type === 'raw' && reqBodyLooksLikeSchema)) && api.req_body_other) {
      const requestSchema = this.prepareSchemaForExport(
        api.req_body_other,
        `${operation.operationId || 'operation'}_Request`,
        'openapi3',
        schemaRegistry
      );
      const originalContent = originalRequestBody?.content && typeof originalRequestBody.content === 'object'
        ? originalRequestBody.content
        : null;
      const nextContent = originalContent
        ? this.replaceOperationContentSchemas(originalContent, requestSchema)
        : {
            'application/json': {
              schema: requestSchema
            }
          };
      operation.requestBody = {
        ...(originalRequestBody ? { ...originalRequestBody } : {}),
        required: originalRequestBody?.required ?? true,
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: nextContent
      };
    } else if (api.req_body_type === 'form') {
      const required: string[] = [];
      const properties: Record<string, any> = {};
      let hasFile = false;
      (api.req_body_form || []).forEach((item: any) => {
        if (String(item.required) === '1') {
          required.push(item.name);
        }
        if (item.type === 'file') {
          hasFile = true;
        }
        properties[item.name] = item.type === 'file'
          ? { type: 'string', format: 'binary', description: item.desc || '' }
          : { type: 'string', description: item.desc || '' };
      });
      const formSchema = {
        type: 'object',
        properties,
        required
      };
      const mediaTypes = this.getRequestBodyMediaTypes(
        originalRequestBody,
        hasFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      );
      operation.requestBody = {
        ...(originalRequestBody ? { ...originalRequestBody } : {}),
        required: originalRequestBody?.required ?? (required.length > 0),
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: this.buildRequestBodyContent(mediaTypes, formSchema)
      };
    } else if (api.req_body_type === 'raw' && api.req_body_other) {
      const mediaTypes = this.getRequestBodyMediaTypes(originalRequestBody, 'text/plain');
      operation.requestBody = {
        ...(originalRequestBody ? { ...originalRequestBody } : {}),
        required: originalRequestBody?.required ?? false,
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: this.buildRequestBodyContent(mediaTypes, {
          type: 'string',
          example: api.req_body_other
        })
      };
    } else if (originalRequestBody) {
      operation.requestBody = originalRequestBody;
    }

    if (api.res_body_type === 'json' && api.res_body) {
      const responseSchema = this.prepareSchemaForExport(
        api.res_body,
        `${operation.operationId || 'operation'}_Response`,
        'openapi3',
        schemaRegistry
      );
      operation.responses = this.replaceOperationResponses(originalResponses, responseSchema);
    } else if (Object.keys(originalResponses).length > 0) {
      operation.responses = originalResponses;
    } else {
      operation.responses['200'] = {
        description: 'successful operation',
        content: {
          'text/plain': {
            schema: {
              type: 'string',
              example: api.res_body || ''
            }
          }
        }
      };
    }
  }

  private buildOpenApiParameters(api: InterfaceEntity): Array<Record<string, unknown>> {
    const parameters: Array<Record<string, unknown>> = [];

    (api.req_headers || []).forEach((item: any) => {
      if (item.name === 'Content-Type') return;
      parameters.push({
        name: item.name,
        in: 'header',
        description: item.desc || '',
        required: String(item.required) === '1',
        schema: { type: 'string', default: item.value }
      });
    });

    (api.req_params || []).forEach((item: any) => {
      parameters.push({
        name: item.name,
        in: 'path',
        description: item.desc || '',
        required: true,
        schema: { type: 'string' }
      });
    });

    (api.req_query || []).forEach((item: any) => {
      parameters.push({
        name: item.name,
        in: 'query',
        description: item.desc || '',
        required: String(item.required) === '1',
        schema: { type: 'string' }
      });
    });

    return parameters;
  }

  private parseJson<T>(text: string, fallback: T): T {
    try {
      const result = JSON.parse(text);
      return result as T;
    } catch (_err) {
      return fallback;
    }
  }

  private isJsonSchemaLikeText(input: unknown): boolean {
    if (typeof input !== 'string' || !input.trim()) {
      return false;
    }
    const parsed = this.parseJson(input, null as Record<string, unknown> | null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    return [
      '$schema',
      '$ref',
      'type',
      'properties',
      'items',
      'required',
      'additionalProperties',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'enum',
      'format'
    ].some(key => Object.prototype.hasOwnProperty.call(parsed, key));
  }

  private prepareSchemaForExport(
    input: string,
    prefix: string,
    format: 'openapi3' | 'swagger2',
    registry: Record<string, unknown>
  ): Record<string, unknown> {
    const parsed = this.parseJson(input, { type: 'object' } as Record<string, unknown>);
    if (!this.schemaNeedsDefinitionHoist(input)) {
      return parsed;
    }
    const context = {
      format,
      prefix: sanitizeSchemaDefinitionName(prefix || 'Operation'),
      registry,
      nameMap: new Map<string, string>(),
      usedNames: new Set(Object.keys(registry)),
      inProgress: new Set<string>()
    };
    const schema = this.rewriteSchemaForExport(parsed, context, this.collectSchemaDefinitions(parsed));
    delete schema.definitions;
    delete schema.$defs;
    return schema;
  }

  private rewriteSchemaForExport(
    input: unknown,
    context: {
      format: 'openapi3' | 'swagger2';
      prefix: string;
      registry: Record<string, unknown>;
      nameMap: Map<string, string>;
      usedNames: Set<string>;
      inProgress: Set<string>;
    },
    localDefinitions: Record<string, unknown>
  ): any {
    if (!input || typeof input !== 'object') {
      return input;
    }
    if (Array.isArray(input)) {
      return input.map(item => this.rewriteSchemaForExport(item, context, localDefinitions));
    }

    const node = toSchemaObject(input);
    const nextLocalDefinitions = {
      ...localDefinitions,
      ...this.collectSchemaDefinitions(node)
    };

    Object.entries(this.collectSchemaDefinitions(node)).forEach(([name, value]) => {
      this.registerSchemaDefinitionForExport(name, value, context, nextLocalDefinitions);
    });

    const result: Record<string, unknown> = {};
    Object.entries(node).forEach(([key, value]) => {
      if (key === 'definitions' || key === '$defs') {
        return;
      }
      if (key === '$ref' && typeof value === 'string') {
        const localName = this.extractLocalDefinitionName(value);
        if (localName && nextLocalDefinitions[localName]) {
          const exportName = this.registerSchemaDefinitionForExport(localName, nextLocalDefinitions[localName], context, nextLocalDefinitions);
          result.$ref = this.buildDefinitionRef(exportName, context.format);
        } else {
          result.$ref = value;
        }
        return;
      }
      if (key === 'properties' || key === 'patternProperties') {
        const next: Record<string, unknown> = {};
        Object.entries(toSchemaObject(value)).forEach(([innerKey, innerValue]) => {
          next[innerKey] = this.rewriteSchemaForExport(innerValue, context, nextLocalDefinitions);
        });
        result[key] = next;
        return;
      }
      if (key === 'items' || key === 'additionalProperties' || key === 'not') {
        if (value === true || value === false) {
          result[key] = value;
        } else {
          result[key] = this.rewriteSchemaForExport(value, context, nextLocalDefinitions);
        }
        return;
      }
      if (key === 'allOf' || key === 'anyOf' || key === 'oneOf' || key === 'prefixItems') {
        result[key] = Array.isArray(value)
          ? value.map(item => this.rewriteSchemaForExport(item, context, nextLocalDefinitions))
          : value;
        return;
      }
      result[key] = value;
    });

    return result;
  }

  private registerSchemaDefinitionForExport(
    rawName: string,
    schema: unknown,
    context: {
      format: 'openapi3' | 'swagger2';
      prefix: string;
      registry: Record<string, unknown>;
      nameMap: Map<string, string>;
      usedNames: Set<string>;
      inProgress: Set<string>;
    },
    localDefinitions: Record<string, unknown>
  ): string {
    const key = String(rawName || '').trim();
    if (context.nameMap.has(key)) {
      return context.nameMap.get(key) as string;
    }

    const baseName = `${context.prefix}_${sanitizeSchemaDefinitionName(key || getSchemaRefName(key) || 'Definition')}`;
    let exportName = baseName;
    let index = 1;
    while (context.usedNames.has(exportName)) {
      exportName = `${baseName}_${index}`;
      index += 1;
    }
    context.usedNames.add(exportName);
    context.nameMap.set(key, exportName);

    if (!context.registry[exportName] && !context.inProgress.has(exportName)) {
      context.inProgress.add(exportName);
      context.registry[exportName] = this.rewriteSchemaForExport(
        schema,
        context,
        {
          ...localDefinitions,
          ...this.collectSchemaDefinitions(schema)
        }
      );
      context.inProgress.delete(exportName);
    }

    return exportName;
  }

  private collectSchemaDefinitions(input: unknown): Record<string, unknown> {
    const node = toSchemaObject(input);
    return {
      ...toSchemaObject(node.definitions),
      ...toSchemaObject(node.$defs)
    };
  }

  private extractLocalDefinitionName(ref: string): string {
    if (ref.startsWith('#/definitions/')) {
      return ref.slice('#/definitions/'.length);
    }
    if (ref.startsWith('#/$defs/')) {
      return ref.slice('#/$defs/'.length);
    }
    return '';
  }

  private buildDefinitionRef(name: string, format: 'openapi3' | 'swagger2'): string {
    return format === 'openapi3'
      ? `#/components/schemas/${name}`
      : `#/definitions/${name}`;
  }

  private getRequestBodyMediaTypes(
    requestBody: Record<string, any> | null,
    fallbackMediaType: string
  ): string[] {
    const content = requestBody?.content;
    if (content && typeof content === 'object') {
      const mediaTypes = Object.keys(content);
      if (mediaTypes.length > 0) {
        return mediaTypes;
      }
    }
    return [fallbackMediaType];
  }

  private buildRequestBodyContent(
    mediaTypes: string[],
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const content: Record<string, unknown> = {};
    mediaTypes.forEach(mediaType => {
      content[mediaType] = { schema };
    });
    return content;
  }

  private replaceOperationContentSchemas(
    contentInput: Record<string, any>,
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const nextContent: Record<string, unknown> = {};
    let replaced = false;
    Object.entries(contentInput).forEach(([mediaType, mediaValue]) => {
      const media = mediaValue && typeof mediaValue === 'object'
        ? { ...mediaValue }
        : {};
      if (media.schema || mediaType.includes('json')) {
        media.schema = schema;
        replaced = true;
      }
      nextContent[mediaType] = media;
    });
    if (!replaced) {
      nextContent['application/json'] = { schema };
    }
    return nextContent;
  }

  private replaceOperationResponses(
    responsesInput: Record<string, any>,
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const source = responsesInput && typeof responsesInput === 'object' ? responsesInput : {};
    const nextResponses: Record<string, unknown> = {};
    let primaryStatusCode = '';
    let hadSchemaResponse = false;

    Object.entries(source).forEach(([statusCode, responseValue]) => {
      if (!primaryStatusCode || statusCode === '200' || statusCode === 'default') {
        primaryStatusCode = statusCode;
      }
      const response = responseValue && typeof responseValue === 'object'
        ? { ...responseValue }
        : { description: 'successful operation' };
      if (response.content && typeof response.content === 'object') {
        response.content = this.replaceOperationContentSchemas(response.content, schema);
        hadSchemaResponse = true;
      }
      nextResponses[statusCode] = response;
    });

    if (!hadSchemaResponse) {
      const targetStatusCode = primaryStatusCode || '200';
      const current = nextResponses[targetStatusCode];
      const base = current && typeof current === 'object'
        ? { ...(current as Record<string, unknown>) }
        : { description: 'successful operation' };
      nextResponses[targetStatusCode] = {
        ...base,
        content: {
          'application/json': {
            schema
          }
        }
      };
    }

    return nextResponses;
  }

  private schemaNeedsDefinitionHoist(input: string): boolean {
    const text = String(input || '');
    return text.includes('"definitions"')
      || text.includes('"$defs"')
      || text.includes('"$ref"');
  }

  private normalizeOperationId(
    rawOperationId: string | undefined,
    method: string,
    path: string,
    usedOperationIds: Set<string>
  ): string {
    const source = rawOperationId || `${method}_${path}`;
    let raw = source
      .replace(/[{}]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!raw) raw = 'operation';
    let output = raw;
    let i = 1;
    while (usedOperationIds.has(output)) {
      output = `${raw}_${i}`;
      i++;
    }
    usedOperationIds.add(output);
    return output;
  }
}
