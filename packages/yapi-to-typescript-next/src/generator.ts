import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import prettier from 'prettier';
import { changeCase } from './change-case';
import { swaggerJsonToYApiData } from './openapi';
import {
  getRequestDataJsonSchema,
  getResponseDataJsonSchema,
  jsonSchemaToType
} from './schema';
import {
  Method,
  QueryStringArrayFormat,
  RequestBodyType,
  ResponseBodyType
} from './types';
import type {
  Category,
  ChangeCase,
  Config,
  ExtendedInterface,
  Interface,
  Project,
  SyntheticalConfig
} from './types';

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = 'yapi-to-typescript-next';
const COMPRESSOR_TREE_SHAKING_ANNOTATION = '/*#__PURE__*/';

type OutputFile = {
  syntheticalConfig: InternalSyntheticalConfig;
  content: string[];
  categoryConstants: Record<string, { mockUrl: string; devUrl: string; prodUrl: string; dataKey: unknown }>;
  requestFunctionFilePath: string;
  requestHookMakerFilePath: string;
};

type InternalSyntheticalConfig = SyntheticalConfig & {
  serverUrl: string;
  token: string;
  id: number;
  outputFilePath: string | ((interfaceInfo: Interface, changeCase: ChangeCase) => string);
  mockUrl: string;
  devUrl: string;
  prodUrl: string;
  projects: any[];
  categories: any[];
};

function castArray<T>(input: T | T[]): T[] {
  return Array.isArray(input) ? input : [input];
}

function uniq<T>(input: T[]): T[] {
  return Array.from(new Set(input));
}

function isFunction(input: unknown): input is (...args: any[]) => any {
  return typeof input === 'function';
}

function omit<T extends Record<string, any>, K extends keyof T>(input: T, keys: K[]): Omit<T, K> {
  const output = { ...input };
  keys.forEach(key => delete output[key]);
  return output;
}

function normalizeBasePath(basepath: unknown): string {
  return (`/${String(basepath || '/')}`).replace(/\/+$/, '').replace(/^\/+/, '/') || '/';
}

function normalizeImportPath(from: string, to: string): string {
  const relative = path.relative(path.dirname(from), to).replace(/\\/g, '/').replace(/\.(ts|js)x?$/i, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function requestBodyTypeName(value: unknown): string {
  const normalized = String(value || RequestBodyType.none);
  return Object.values(RequestBodyType).includes(normalized as RequestBodyType)
    ? normalized
    : RequestBodyType.none;
}

function responseBodyTypeName(value: unknown): string {
  const normalized = String(value || ResponseBodyType.raw);
  return Object.values(ResponseBodyType).includes(normalized as ResponseBodyType)
    ? normalized
    : ResponseBodyType.raw;
}

function methodName(value: unknown): Method {
  const normalized = String(value || Method.GET).toUpperCase();
  return Object.values(Method).includes(normalized as Method) ? normalized as Method : Method.GET;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

export class Generator {
  protected config: any[];

  constructor(config: Config, private readonly options: { cwd: string } = { cwd: process.cwd() }) {
    this.config = castArray(config);
  }

  async prepare(): Promise<void> {
    this.config = this.config.map(item => ({
      ...item,
      serverType: item.serverType || 'yapi',
      serverUrl: item.serverUrl ? item.serverUrl.replace(/\/+$/, '') : item.serverUrl
    }));
  }

  async generate(): Promise<Record<string, OutputFile>> {
    const outputFileList: Record<string, OutputFile> = {};

    for (const [serverIndex, serverConfig] of this.config.entries()) {
      const projects = (serverConfig.projects || []).flatMap((project: any) =>
        castArray(project.token).map(token => ({
          ...project,
          token
        }))
      );

      for (const [projectIndex, projectConfig] of projects.entries()) {
        const projectInfo = await this.fetchProjectInfo({ ...serverConfig, ...projectConfig });

        for (const [categoryIndex, categoryConfigSource] of (projectConfig.categories || []).entries()) {
          let categoryIds = castArray(categoryConfigSource.id);
          if (categoryIds.includes(0)) {
            categoryIds = [...categoryIds, ...projectInfo.cats.map(cat => cat._id)];
          }
          const excluded = categoryIds.filter(id => id < 0).map(Math.abs);
          categoryIds = uniq(categoryIds)
            .filter(id => id > 0 && !excluded.includes(Math.abs(id)))
            .filter(id => projectInfo.cats.some(cat => cat._id === id))
            .sort((a, b) => a - b);

          for (const [categoryIndex2, id] of categoryIds.entries()) {
            const categoryConfig = { ...categoryConfigSource, id };
            const syntheticalConfig: InternalSyntheticalConfig = {
              ...serverConfig,
              ...projectConfig,
              ...categoryConfig,
              token: projectConfig.token,
              id,
              target: categoryConfig.target || projectConfig.target || serverConfig.target || 'typescript',
              mockUrl: projectInfo.getMockUrl(),
              devUrl: projectInfo.getDevUrl(syntheticalConfigValue(categoryConfig.devEnvName, projectConfig.devEnvName, serverConfig.devEnvName)),
              prodUrl: projectInfo.getProdUrl(syntheticalConfigValue(categoryConfig.prodEnvName, projectConfig.prodEnvName, serverConfig.prodEnvName))
            };
            const categoryUID = `_${serverIndex}_${projectIndex}_${categoryIndex}_${categoryIndex2}`;
            const interfaceList = (await this.fetchInterfaceList(syntheticalConfig))
              .map(interfaceInfo => {
                interfaceInfo._project = omit(projectInfo, ['cats', 'getMockUrl', 'getDevUrl', 'getProdUrl']) as Project;
                const processed = isFunction(syntheticalConfig.preproccessInterface)
                  ? syntheticalConfig.preproccessInterface(JSON.parse(JSON.stringify(interfaceInfo)), changeCase, syntheticalConfig)
                  : interfaceInfo;
                return processed || null;
              })
              .filter(Boolean) as Interface[];

            interfaceList.sort((a, b) => Number(a._id || 0) - Number(b._id || 0));
            for (const interfaceInfo of interfaceList) {
              const outputFilePath = path.resolve(
                this.options.cwd,
                typeof syntheticalConfig.outputFilePath === 'function'
                  ? syntheticalConfig.outputFilePath(interfaceInfo, changeCase)
                  : syntheticalConfig.outputFilePath
              );
              const code = await this.generateInterfaceCode(syntheticalConfig, interfaceInfo, categoryUID);
              if (!outputFileList[outputFilePath]) {
                outputFileList[outputFilePath] = {
                  syntheticalConfig,
                  content: [],
                  categoryConstants: {},
                  requestFunctionFilePath: syntheticalConfig.requestFunctionFilePath
                    ? path.resolve(this.options.cwd, syntheticalConfig.requestFunctionFilePath)
                    : path.join(path.dirname(outputFilePath), 'request.ts'),
                  requestHookMakerFilePath: syntheticalConfig.reactHooks?.enabled
                    ? syntheticalConfig.reactHooks.requestHookMakerFilePath
                      ? path.resolve(this.options.cwd, syntheticalConfig.reactHooks.requestHookMakerFilePath)
                      : path.join(path.dirname(outputFilePath), 'makeRequestHook.ts')
                    : ''
                };
              }
              outputFileList[outputFilePath].categoryConstants[categoryUID] = {
                mockUrl: syntheticalConfig.mockUrl,
                devUrl: syntheticalConfig.devUrl,
                prodUrl: syntheticalConfig.prodUrl,
                dataKey: syntheticalConfig.dataKey
              };
              outputFileList[outputFilePath].content.push(code);
            }
          }
        }
      }
    }

    return outputFileList;
  }

  async write(outputFileList: Record<string, OutputFile>): Promise<void> {
    for (const rawOutputFilePath of Object.keys(outputFileList)) {
      const outputFile = outputFileList[rawOutputFilePath];
      let outputFilePath = rawOutputFilePath.replace(/\.js(x)?$/, '.ts$1');
      const requestFunctionFilePath = outputFile.requestFunctionFilePath.replace(/\.js(x)?$/, '.ts$1');
      const requestHookMakerFilePath = outputFile.requestHookMakerFilePath.replace(/\.js(x)?$/, '.ts$1');

      if (!outputFile.syntheticalConfig.typesOnly && !(await pathExists(outputFile.requestFunctionFilePath))) {
        await fs.mkdir(path.dirname(requestFunctionFilePath), { recursive: true });
        await fs.writeFile(requestFunctionFilePath, this.defaultRequestFunctionSource(), 'utf8');
      }

      if (!outputFile.syntheticalConfig.typesOnly && outputFile.syntheticalConfig.reactHooks?.enabled && requestHookMakerFilePath && !(await pathExists(outputFile.requestHookMakerFilePath))) {
        await fs.mkdir(path.dirname(requestHookMakerFilePath), { recursive: true });
        await fs.writeFile(requestHookMakerFilePath, this.defaultRequestHookMakerSource(requestHookMakerFilePath, requestFunctionFilePath), 'utf8');
      }

      const rawSource = this.renderOutputFile(outputFilePath, requestFunctionFilePath, requestHookMakerFilePath, outputFile);
      const prettySource = await prettier.format(rawSource, {
        parser: 'typescript',
        printWidth: 120,
        singleQuote: true,
        semi: false,
        trailingComma: 'all',
        bracketSpacing: false
      });
      await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
      await fs.writeFile(outputFilePath, `/* prettier-ignore-start */\n${prettySource.trim()}\n/* prettier-ignore-end */\n`, 'utf8');

      if (outputFile.syntheticalConfig.target === 'javascript') {
        await this.tsc(outputFilePath);
        await Promise.all([
          fs.rm(requestFunctionFilePath, { force: true }),
          fs.rm(requestHookMakerFilePath, { force: true }),
          fs.rm(outputFilePath, { force: true })
        ]);
        outputFilePath = outputFilePath.replace(/\.tsx?$/, '.js');
      }
    }
  }

  async destroy(): Promise<void> {
    return undefined;
  }

  async fetchApi(url: string, query: Record<string, unknown>): Promise<any> {
    const requestUrl = new URL(url);
    Object.entries(query).forEach(([key, value]) => {
      if (value != null) requestUrl.searchParams.set(key, String(value));
    });
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText} [${requestUrl.toString()}]`);
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (payload && typeof payload.errcode === 'number' && payload.errcode !== 0) {
      throw new Error(`${payload.errmsg || 'YApi request failed'} [${requestUrl.toString()}]`);
    }
    return payload?.data ?? payload;
  }

  async fetchProject({ serverUrl, token, serverType }: { serverUrl: string; token: string; serverType?: string }): Promise<Project> {
    if (serverType === 'swagger' || serverType === 'openapi') {
      const data = await this.fetchOpenApiData(serverUrl);
      return {
        ...data.project,
        basepath: normalizeBasePath(data.project.basepath)
      };
    }
    const projectInfo = await this.fetchApi(`${serverUrl}/api/project/get`, { token });
    projectInfo.basepath = normalizeBasePath(projectInfo.basepath || '/');
    projectInfo._url = `${serverUrl}/project/${projectInfo._id}/interface/api`;
    return projectInfo;
  }

  async fetchProjectInfo(syntheticalConfig: { serverUrl: string; token: string; serverType?: string }): Promise<Project & {
    cats: Category[];
    getMockUrl(): string;
    getDevUrl(name?: string): string;
    getProdUrl(name?: string): string;
  }> {
    if (syntheticalConfig.serverType === 'swagger' || syntheticalConfig.serverType === 'openapi') {
      const data = await this.fetchOpenApiData(syntheticalConfig.serverUrl);
      return {
        ...data.project,
        basepath: normalizeBasePath(data.project.basepath),
        cats: data.cats,
        getMockUrl: () => '',
        getDevUrl: () => '',
        getProdUrl: () => ''
      };
    }

    const projectInfo = await this.fetchProject(syntheticalConfig);
    const cats = await this.fetchApi(`${syntheticalConfig.serverUrl}/api/interface/getCatMenu`, {
      token: syntheticalConfig.token,
      project_id: projectInfo._id
    });
    return {
      ...projectInfo,
      cats,
      getMockUrl: () => `${syntheticalConfig.serverUrl}/mock/${projectInfo._id}`,
      getDevUrl: (name?: string) => (projectInfo.env || []).find(item => item.name === name)?.domain || '',
      getProdUrl: (name?: string) => (projectInfo.env || []).find(item => item.name === name)?.domain || ''
    };
  }

  async fetchInterfaceList(syntheticalConfig: InternalSyntheticalConfig): Promise<Interface[]> {
    if (syntheticalConfig.serverType === 'swagger' || (syntheticalConfig.serverType as string) === 'openapi') {
      const data = await this.fetchOpenApiData(syntheticalConfig.serverUrl);
      const category = data.cats.find(cat => cat._id === syntheticalConfig.id);
      return data.interfaces
        .filter(item => item.catid === syntheticalConfig.id)
        .map(item => ({
          ...item,
          _category: category ? omit(category, ['list']) : undefined
        }));
    }

    const categoryList = await this.fetchExport(syntheticalConfig);
    const category = categoryList.find(cat => Array.isArray(cat.list) && cat.list[0]?.catid === syntheticalConfig.id);
    if (!category) return [];
    return (category.list || []).map(item => ({
      ...item,
      _category: omit(category, ['list'])
    }));
  }

  async fetchExport({ serverUrl, token }: { serverUrl: string; token: string }): Promise<Array<Category & { list: Interface[] }>> {
    const projectInfo = await this.fetchProject({ serverUrl, token });
    const categoryList = await this.fetchApi(`${serverUrl}/api/plugin/export`, {
      type: 'json',
      status: 'all',
      isWiki: 'false',
      token
    });
    return (categoryList || []).map((cat: Category & { list?: Interface[] }) => {
      const projectId = cat.list?.[0]?.project_id || projectInfo._id || 0;
      const catId = cat.list?.[0]?.catid || cat._id || 0;
      cat._url = `${serverUrl}/project/${projectId}/interface/api/cat_${catId}`;
      cat.list = (cat.list || []).map(item => ({
        ...item,
        _url: `${serverUrl}/project/${projectId}/interface/api/${item._id}`,
        path: `${projectInfo.basepath || ''}${item.path}`
      }));
      return cat as Category & { list: Interface[] };
    });
  }

  async generateInterfaceCode(syntheticalConfig: InternalSyntheticalConfig, interfaceInfo: Interface, categoryUID: string): Promise<string> {
    const extendedInterfaceInfo: ExtendedInterface = {
      ...interfaceInfo,
      parsedPath: path.parse(interfaceInfo.path)
    };
    const requestFunctionName = isFunction(syntheticalConfig.getRequestFunctionName)
      ? await syntheticalConfig.getRequestFunctionName(extendedInterfaceInfo, changeCase)
      : changeCase.camelCase(extendedInterfaceInfo.parsedPath.name || `${extendedInterfaceInfo.method}_${extendedInterfaceInfo.path}`);
    const requestConfigName = changeCase.camelCase(`${requestFunctionName}RequestConfig`);
    const requestConfigTypeName = changeCase.pascalCase(requestConfigName);
    const requestDataTypeName = isFunction(syntheticalConfig.getRequestDataTypeName)
      ? await syntheticalConfig.getRequestDataTypeName(extendedInterfaceInfo, changeCase)
      : changeCase.pascalCase(`${requestFunctionName}Request`);
    const responseDataTypeName = isFunction(syntheticalConfig.getResponseDataTypeName)
      ? await syntheticalConfig.getResponseDataTypeName(extendedInterfaceInfo, changeCase)
      : changeCase.pascalCase(`${requestFunctionName}Response`);
    const requestDataJsonSchema = getRequestDataJsonSchema(extendedInterfaceInfo, syntheticalConfig.customTypeMapping || {});
    const responseDataJsonSchema = getResponseDataJsonSchema(
      extendedInterfaceInfo,
      syntheticalConfig.customTypeMapping || {},
      syntheticalConfig.dataKey
    );
    const requestDataType = await jsonSchemaToType(requestDataJsonSchema, requestDataTypeName);
    const responseDataType = await jsonSchemaToType(responseDataJsonSchema, responseDataTypeName);
    const isRequestDataOptional = /(\{\}|any)$/.test(requestDataType);
    const requestHookName = syntheticalConfig.reactHooks?.enabled
      ? isFunction(syntheticalConfig.reactHooks.getRequestHookName)
        ? await syntheticalConfig.reactHooks.getRequestHookName(extendedInterfaceInfo, changeCase)
        : `use${changeCase.pascalCase(requestFunctionName)}`
      : '';
    const paramNames = (extendedInterfaceInfo.req_params || []).map(item => item.name).filter(Boolean);
    const queryNames = (extendedInterfaceInfo.req_query || []).map(item => item.name).filter(Boolean);
    const paramNameType = paramNames.length === 0 ? 'string' : `'${paramNames.join("' | '")}'`;
    const queryNameType = queryNames.length === 0 ? 'string' : `'${queryNames.join("' | '")}'`;
    const extraInfo = isFunction(syntheticalConfig.setRequestFunctionExtraInfo)
      ? await syntheticalConfig.setRequestFunctionExtraInfo(extendedInterfaceInfo, changeCase)
      : {};

    const headers = (extendedInterfaceInfo.req_headers || [])
      .filter(item => String(item.name || '').toLowerCase() !== 'content-type')
      .reduce<Record<string, string>>((result, item) => {
        result[item.name] = item.value || '';
        return result;
      }, {});
    const requestBodyType = methodName(extendedInterfaceInfo.method) === Method.GET
      ? RequestBodyType.query
      : requestBodyTypeName(extendedInterfaceInfo.req_body_type);
    const responseBodyType = responseBodyTypeName(extendedInterfaceInfo.res_body_type);
    const requestDataSchemaOutput = syntheticalConfig.jsonSchema?.enabled && syntheticalConfig.jsonSchema.requestData !== false
      ? requestDataJsonSchema
      : {};
    const responseDataSchemaOutput = syntheticalConfig.jsonSchema?.enabled && syntheticalConfig.jsonSchema.responseData !== false
      ? responseDataJsonSchema
      : {};

    const requestTypeCode = `${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **请求类型**`)}
${requestDataType.trim()}`;
    const responseTypeCode = `${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **返回类型**`)}
${responseDataType.trim()}`;

    if (syntheticalConfig.typesOnly) {
      return `${requestTypeCode}\n\n${responseTypeCode}`;
    }

    return `${requestTypeCode}

${responseTypeCode}

${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **请求配置的类型**`)}
type ${requestConfigTypeName} = Readonly<RequestConfig<
  ${JSON.stringify(syntheticalConfig.mockUrl)},
  ${JSON.stringify(syntheticalConfig.devUrl)},
  ${JSON.stringify(syntheticalConfig.prodUrl)},
  ${JSON.stringify(extendedInterfaceInfo.path)},
  ${JSON.stringify(syntheticalConfig.dataKey) || 'undefined'},
  ${paramNameType},
  ${queryNameType},
  ${JSON.stringify(isRequestDataOptional)}
>>

${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **请求配置**`)}
const ${requestConfigName}: ${requestConfigTypeName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} {
  mockUrl: mockUrl${categoryUID},
  devUrl: devUrl${categoryUID},
  prodUrl: prodUrl${categoryUID},
  path: ${JSON.stringify(extendedInterfaceInfo.path)},
  method: Method.${methodName(extendedInterfaceInfo.method)},
  requestHeaders: ${JSON.stringify(headers)},
  requestBodyType: RequestBodyType.${requestBodyType},
  responseBodyType: ResponseBodyType.${responseBodyType},
  dataKey: dataKey${categoryUID},
  paramNames: ${JSON.stringify(paramNames)},
  queryNames: ${JSON.stringify(queryNames)},
  requestDataOptional: ${JSON.stringify(isRequestDataOptional)},
  requestDataJsonSchema: ${JSON.stringify(requestDataSchemaOutput)},
  responseDataJsonSchema: ${JSON.stringify(responseDataSchemaOutput)},
  requestFunctionName: ${JSON.stringify(requestFunctionName)},
  queryStringArrayFormat: QueryStringArrayFormat.${syntheticalConfig.queryStringArrayFormat || QueryStringArrayFormat.brackets},
  extraInfo: ${JSON.stringify(extraInfo)},
}

${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **请求函数**`)}
export const ${requestFunctionName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} (
  requestData${isRequestDataOptional ? '?' : ''}: ${requestDataTypeName},
  ...args: UserRequestRestArgs
) => {
  return request<${responseDataTypeName}>(
    prepare(${requestConfigName}, requestData),
    ...args,
  )
}

${requestFunctionName}.requestConfig = ${requestConfigName}

${requestHookName ? `
${this.genComment(syntheticalConfig, extendedInterfaceInfo, title => `接口 ${title} 的 **React Hook**`)}
export const ${requestHookName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} makeRequestHook<${requestDataTypeName}, ${requestConfigTypeName}, ReturnType<typeof ${requestFunctionName}>>(${requestFunctionName})
` : ''}
`;
  }

  private async fetchOpenApiData(serverUrl: string): Promise<Awaited<ReturnType<typeof swaggerJsonToYApiData>>> {
    if (/^https?:\/\//i.test(serverUrl)) {
      const response = await fetch(serverUrl);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText} [${serverUrl}]`);
      }
      return swaggerJsonToYApiData(await response.text());
    }
    const source = await fs.readFile(path.resolve(this.options.cwd, serverUrl), 'utf8');
    return swaggerJsonToYApiData(source);
  }

  private renderOutputFile(
    outputFilePath: string,
    requestFunctionFilePath: string,
    requestHookMakerFilePath: string,
    outputFile: OutputFile
  ): string {
    const content = outputFile.content.join('\n\n').trim();
    if (outputFile.syntheticalConfig.typesOnly) {
      return `
/* tslint:disable */
/* eslint-disable */
/* 该文件由 yapi-to-typescript 自动生成，请勿直接修改！！！ */

// @ts-ignore
type FileData = File

${content}
`;
    }

    return `
/* tslint:disable */
/* eslint-disable */
/* 该文件由 yapi-to-typescript 自动生成，请勿直接修改！！！ */

// @ts-ignore
// prettier-ignore
import { QueryStringArrayFormat, Method, RequestBodyType, ResponseBodyType, FileData, prepare } from '${PACKAGE_NAME}'
// @ts-ignore
// prettier-ignore
import type { RequestConfig, RequestFunctionRestArgs } from '${PACKAGE_NAME}'
// @ts-ignore
import request from ${JSON.stringify(normalizeImportPath(outputFilePath, requestFunctionFilePath))}
${outputFile.syntheticalConfig.reactHooks?.enabled ? `// @ts-ignore\nimport makeRequestHook from ${JSON.stringify(normalizeImportPath(outputFilePath, requestHookMakerFilePath))}` : ''}

type UserRequestRestArgs = RequestFunctionRestArgs<typeof request>

export type Request<TRequestData, TRequestConfig extends RequestConfig, TRequestResult> = (
  TRequestConfig['requestDataOptional'] extends true
    ? (requestData?: TRequestData, ...args: RequestFunctionRestArgs<typeof request>) => TRequestResult
    : (requestData: TRequestData, ...args: RequestFunctionRestArgs<typeof request>) => TRequestResult
) & {
  requestConfig: TRequestConfig
}

${this.categoryConstants(outputFile)}

${content}
`;
  }

  private categoryConstants(outputFile: OutputFile): string {
    return Object.entries(outputFile.categoryConstants).map(([categoryUID, values]) => `
const mockUrl${categoryUID} = ${JSON.stringify(values.mockUrl)} as any
const devUrl${categoryUID} = ${JSON.stringify(values.devUrl)} as any
const prodUrl${categoryUID} = ${JSON.stringify(values.prodUrl)} as any
const dataKey${categoryUID} = ${JSON.stringify(values.dataKey)} as any
`).join('\n');
  }

  private defaultRequestFunctionSource(): string {
    return `
import type { RequestFunctionParams } from '${PACKAGE_NAME}'

export interface RequestOptions {
  /**
   * 使用的服务器。
   *
   * - \`prod\`: 生产服务器
   * - \`dev\`: 测试服务器
   * - \`mock\`: 模拟服务器
   *
   * @default prod
   */
  server?: 'prod' | 'dev' | 'mock'
}

export default function request<TResponseData>(
  payload: RequestFunctionParams,
  options: RequestOptions = { server: 'prod' },
): Promise<TResponseData> {
  return new Promise<TResponseData>((resolve, reject) => {
    // 基本地址
    const baseUrl = options.server === 'mock'
      ? payload.mockUrl
      : options.server === 'dev'
        ? payload.devUrl
        : payload.prodUrl

    // 请求地址
    const url = \`\${baseUrl}\${payload.path}\`

    // 具体请求逻辑
  })
}
`;
  }

  private defaultRequestHookMakerSource(requestHookMakerFilePath: string, requestFunctionFilePath: string): string {
    return `
import { useState, useEffect } from 'react'
import type { RequestConfig } from '${PACKAGE_NAME}'
import type { Request } from ${JSON.stringify(normalizeImportPath(requestHookMakerFilePath, requestFunctionFilePath))}
import baseRequest from ${JSON.stringify(normalizeImportPath(requestHookMakerFilePath, requestFunctionFilePath))}

export default function makeRequestHook<TRequestData, TRequestConfig extends RequestConfig, TRequestResult extends ReturnType<typeof baseRequest>>(
  request: Request<TRequestData, TRequestConfig, TRequestResult>,
) {
  type Data = TRequestResult extends Promise<infer R> ? R : TRequestResult
  return function useRequest(requestData: TRequestData) {
    // 一个简单的 Hook 实现，实际项目可结合其他库使用，比如：
    // @umijs/hooks 的 useRequest (https://github.com/umijs/hooks)
    // swr (https://github.com/zeit/swr)

    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<Data>()

    useEffect(() => {
      request(requestData).then(data => {
        setLoading(false)
        setData(data as any)
      })
    }, [JSON.stringify(requestData)])

    return {
      loading,
      data,
    }
  }
}
`;
  }

  private genComment(
    syntheticalConfig: InternalSyntheticalConfig,
    interfaceInfo: ExtendedInterface,
    genTitle: (title: string) => string
  ): string {
    const config = {
      enabled: true,
      title: true,
      category: true,
      tag: true,
      requestHeader: true,
      updateTime: true,
      link: true,
      ...(syntheticalConfig.comment || {}),
      ...(syntheticalConfig.serverType === 'swagger' || (syntheticalConfig.serverType as string) === 'openapi'
        ? { tag: false, updateTime: false, link: false }
        : {})
    };

    if (!config.enabled) return '';

    const escapedTitle = String(interfaceInfo.title || '').replace(/\//g, '\\/');
    const description = config.link ? `[${escapedTitle}↗](${interfaceInfo._url})` : escapedTitle;
    const summary: Array<{ label: string; value: any }> = [
      config.category && {
        label: '分类',
        value: config.link
          ? `[${interfaceInfo._category?.name || ''}↗](${interfaceInfo._category?._url || ''})`
          : interfaceInfo._category?.name || ''
      },
      config.tag && {
        label: '标签',
        value: (interfaceInfo.tag || []).map(tag => `\`${tag}\``)
      },
      config.requestHeader && {
        label: '请求头',
        value: `\`${String(interfaceInfo.method || '').toUpperCase()} ${interfaceInfo.path}\``
      },
      config.updateTime && {
        label: '更新时间',
        value: `\`${this.formatUpdateTime(interfaceInfo.up_time)}\``
      }
    ].filter(Boolean) as Array<{ label: string; value: any }>;

    if (typeof config.extraTags === 'function') {
      for (const tag of config.extraTags(interfaceInfo)) {
        const item = { label: tag.name, value: tag.value };
        if (tag.position === 'start') summary.unshift(item);
        else summary.push(item);
      }
    }

    const titleComment = config.title
      ? ` * ${genTitle(description)}\n *`
      : '';
    const extraComment = summary
      .filter(item => Array.isArray(item.value) ? item.value.length > 0 : item.value != null && item.value !== '')
      .map(item => ` * @${item.label} ${Array.isArray(item.value) ? item.value.join(', ') : item.value}`)
      .join('\n');
    return `/**\n${[titleComment, extraComment].filter(Boolean).join('\n')}\n */`;
  }

  private formatUpdateTime(value: unknown): string {
    const date = new Date(Number(value || 0) * 1000);
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private async tsc(filePath: string): Promise<void> {
    await execFileAsync(process.execPath, [
      require.resolve('typescript/bin/tsc'),
      '--target',
      'ES2019',
      '--module',
      'ESNext',
      '--jsx',
      'preserve',
      '--declaration',
      '--esModuleInterop',
      filePath
    ], { cwd: this.options.cwd });
  }
}

function syntheticalConfigValue<T>(...values: Array<T | undefined>): T | undefined {
  return values.find(value => value !== undefined);
}
