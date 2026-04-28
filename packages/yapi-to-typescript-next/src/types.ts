export type AsyncOrSync<T> = T | PromiseLike<T>;
export type OneOrMore<T> = T | T[];

export enum Method {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  PATCH = 'PATCH'
}

export enum Required {
  false = '0',
  true = '1'
}

export enum RequestBodyType {
  query = 'query',
  form = 'form',
  json = 'json',
  text = 'text',
  file = 'file',
  raw = 'raw',
  none = 'none'
}

export enum RequestParamType {
  string = 'string',
  number = 'number'
}

export enum RequestQueryType {
  string = 'string',
  number = 'number'
}

export enum RequestFormItemType {
  text = 'text',
  file = 'file'
}

export enum ResponseBodyType {
  json = 'json',
  text = 'text',
  xml = 'xml',
  raw = 'raw'
}

export enum QueryStringArrayFormat {
  brackets = 'brackets',
  indices = 'indices',
  repeat = 'repeat',
  comma = 'comma',
  json = 'json'
}

export interface ChangeCase {
  camelCase(value: string): string;
  constantCase(value: string): string;
  dotCase(value: string): string;
  headerCase(value: string): string;
  lowerCase(value: string): string;
  lowerCaseFirst(value: string): string;
  paramCase(value: string): string;
  pascalCase(value: string): string;
  pathCase(value: string): string;
  sentenceCase(value: string): string;
  snakeCase(value: string): string;
  swapCase(value: string): string;
  titleCase(value: string): string;
  upperCase(value: string): string;
  upperCaseFirst(value: string): string;
}

export interface Project {
  _id: number;
  _url?: string;
  name: string;
  desc?: string;
  basepath?: string;
  tag?: string[];
  env?: Array<{ name: string; domain: string }>;
  [key: string]: any;
}

export interface Category {
  _id: number;
  _url?: string;
  name: string;
  desc?: string;
  list?: InterfaceList;
  add_time?: number;
  up_time?: number;
  [key: string]: any;
}

export interface Interface {
  _id: number;
  _category?: Omit<Category, 'list'>;
  _project?: Project;
  _url?: string;
  title: string;
  status?: string;
  markdown?: string;
  desc?: string;
  path: string;
  method: Method | string;
  project_id?: number;
  catid: number;
  tag?: string[];
  req_headers?: Array<Record<string, any>>;
  req_params?: Array<Record<string, any>>;
  req_query?: Array<Record<string, any>>;
  req_body_type?: RequestBodyType | string;
  req_body_is_json_schema?: boolean;
  req_body_form?: Array<Record<string, any>>;
  req_body_other?: string;
  res_body_type?: ResponseBodyType | string;
  res_body_is_json_schema?: boolean;
  res_body?: string;
  add_time?: number;
  up_time?: number;
  uid?: number;
  [key: string]: any;
}

export interface ExtendedInterface extends Interface {
  parsedPath: import('node:path').ParsedPath;
}

export type InterfaceList = Interface[];
export type CategoryList = Category[];

export interface PropDefinition {
  name: string;
  required: boolean;
  type?: string;
  comment?: string;
}

export type PropDefinitions = PropDefinition[];

export interface RequestConfig<
  MockUrl extends string = string,
  DevUrl extends string = string,
  ProdUrl extends string = string,
  Path extends string = string,
  DataKey extends OneOrMore<string> | undefined = OneOrMore<string> | undefined,
  ParamName extends string = string,
  QueryName extends string = string,
  RequestDataOptional extends boolean = boolean
> {
  mockUrl: MockUrl;
  devUrl: DevUrl;
  prodUrl: ProdUrl;
  path: Path;
  method: Method;
  requestHeaders: Record<string, string>;
  requestBodyType: RequestBodyType;
  responseBodyType: ResponseBodyType;
  dataKey: DataKey;
  paramNames: ParamName[];
  queryNames: QueryName[];
  requestDataOptional: RequestDataOptional;
  requestDataJsonSchema: Record<string, any>;
  responseDataJsonSchema: Record<string, any>;
  requestFunctionName: string;
  queryStringArrayFormat: QueryStringArrayFormat;
  extraInfo: Record<string, any>;
}

export interface RequestFunctionParams extends RequestConfig {
  rawData: any;
  data: any;
  hasFileData: boolean;
  fileData: Record<string, any>;
  allData: Record<string, any>;
  getFormData: () => FormData;
}

export type RequestFunctionRestArgs<T extends Function> =
  T extends (payload: any, ...args: infer R) => any ? R : never;

export interface JsonSchemaConfig {
  enabled: boolean;
  requestData?: boolean;
  responseData?: boolean;
}

export interface CommentConfig {
  enabled?: boolean;
  title?: boolean;
  category?: boolean;
  tag?: boolean;
  requestHeader?: boolean;
  updateTime?: boolean;
  link?: boolean;
  extraTags?: (interfaceInfo: ExtendedInterface) => Array<{ name: string; value: string | string[]; position?: 'start' | 'end' }>;
}

export interface ReactHooksConfig {
  enabled: boolean;
  requestHookMakerFilePath?: string;
  getRequestHookName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string | Promise<string>;
}

export interface SharedConfig {
  typesOnly?: boolean;
  target?: 'typescript' | 'javascript';
  outputFilePath?: string | ((interfaceInfo: Interface, changeCase: ChangeCase) => string);
  requestFunctionFilePath?: string;
  dataKey?: OneOrMore<string>;
  devEnvName?: string;
  prodEnvName?: string;
  reactHooks?: ReactHooksConfig;
  jsonSchema?: JsonSchemaConfig;
  comment?: CommentConfig;
  queryStringArrayFormat?: QueryStringArrayFormat;
  customTypeMapping?: Record<string, string>;
  setRequestFunctionExtraInfo?(interfaceInfo: Interface, changeCase: ChangeCase): Record<string, any>;
  preproccessInterface?(interfaceInfo: Interface, changeCase: ChangeCase, config: SyntheticalConfig): Interface | false;
  getRequestFunctionName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;
  getRequestDataTypeName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;
  getResponseDataTypeName?(interfaceInfo: ExtendedInterface, changeCase: ChangeCase): string;
}

export interface CategoryConfig extends SharedConfig {
  id: number | number[];
}

export interface ProjectConfig extends SharedConfig {
  token: string | string[];
  categories: CategoryConfig[];
}

export interface ServerConfig extends SharedConfig {
  serverUrl: string;
  serverType?: 'yapi' | 'swagger';
  projects: ProjectConfig[];
}

export type SyntheticalConfig = Partial<ServerConfig & ProjectConfig & CategoryConfig & {
  mockUrl: string;
  devUrl: string;
  prodUrl: string;
}>;

export type Config = ServerConfig | ServerConfig[];

export interface CliHooks {
  success?: () => AsyncOrSync<void>;
  fail?: () => AsyncOrSync<void>;
  complete?: () => AsyncOrSync<void>;
}

export type ConfigWithHooks = Config & { hooks?: CliHooks };
