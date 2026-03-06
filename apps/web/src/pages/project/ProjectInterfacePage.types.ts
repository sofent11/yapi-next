import type { InterfaceDTO } from '../../types/interface-dto';

export type ProjectInterfacePageProps = {
  projectId: number;
  basepath?: string;
  token?: string;
  projectRole?: string;
  projectGroupId?: number;
  projectTag?: Array<{ name?: string; desc?: string }>;
  projectSwitchNotice?: boolean;
  projectIsJson5?: boolean;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
};

export type EditFormParam = {
  name: string;
  required?: '1' | '0';
  desc?: string;
  example?: string;
};

export type EditFormHeaderParam = EditFormParam & {
  value?: string;
};

export type EditFormBodyParam = EditFormParam & {
  type?: 'text' | 'file';
};

export type EditForm = {
  catid: number;
  title: string;
  path: string;
  method: string;
  status: 'done' | 'undone';
  tag?: string[];
  custom_field_value?: string;
  req_query?: EditFormParam[];
  req_headers?: EditFormHeaderParam[];
  req_params?: Array<{ name: string; desc?: string; example?: string }>;
  req_body_type?: 'form' | 'json' | 'file' | 'raw';
  req_body_form?: EditFormBodyParam[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: 'json' | 'raw';
  res_body?: string;
  res_body_is_json_schema?: boolean;
  desc?: string;
  switch_notice?: boolean;
  api_opened?: boolean;
};

export type AddInterfaceForm = {
  title: string;
  path: string;
  method: string;
  catid: number;
};

export type AddCatForm = {
  name: string;
  desc?: string;
};

export type EditCatForm = {
  name: string;
  desc?: string;
};

export type ColForm = {
  name: string;
  desc?: string;
};

export type AddCaseForm = {
  interface_id: number;
  casename: string;
  case_env?: string;
};

export type CaseEditForm = {
  casename: string;
  case_env?: string;
  enable_script?: boolean;
  test_script?: string;
  req_params_text?: string;
  req_headers_text?: string;
  req_query_text?: string;
  req_body_form_text?: string;
  req_body_type?: string;
  req_body_other?: string;
};

export type AutoTestResultItem = {
  id: string;
  name: string;
  path: string;
  code: number;
  validRes?: Array<{ message?: string }>;
  status?: number | null;
  statusText?: string;
  url?: string;
  method?: string;
  data?: unknown;
  headers?: unknown;
  res_header?: unknown;
  res_body?: unknown;
  params?: Record<string, unknown>;
  interface_id?: number;
  interfaceId?: number;
};

export type AutoTestReport = {
  message?: {
    msg?: string;
    len?: number;
    successNum?: number;
    failedNum?: number;
  };
  runTime?: string;
  numbs?: number;
  list?: AutoTestResultItem[];
};

export type CaseEnvProjectItem = {
  _id: number;
  name: string;
  env?: Array<{ name?: string; domain?: string }>;
};

export type CommonSettingForm = {
  checkHttpCodeIs200: boolean;
  checkResponseSchema: boolean;
  checkResponseFieldEnable: boolean;
  checkResponseFieldName: string;
  checkResponseFieldValue: string;
  checkScriptEnable: boolean;
  checkScriptContent: string;
};

export type InterfaceNodePageResponse = {
  errcode: number;
  errmsg?: string;
  data?: { list?: InterfaceDTO[]; total?: number };
};

export type SchemaRow = {
  key: string;
  name: string;
  type: string;
  required: string;
  defaultValue: string;
  desc: string;
  other: string;
  children?: SchemaRow[];
};

export type ParamRow = {
  key: number;
  name: string;
  required: string;
  example: string;
  desc: string;
  type?: string;
  value?: string;
};

export type MenuDragItem =
  | { type: 'cat'; id: number }
  | { type: 'interface'; id: number; catid: number };

export type ColDragItem =
  | { type: 'col'; colId: number }
  | { type: 'case'; colId: number; caseId: string };

export type ImportInterfaceRow = {
  key: string;
  id?: number;
  title: string;
  path?: string;
  method?: string;
  status?: string;
  isCategory: boolean;
  children?: ImportInterfaceRow[];
};

export type EditConflictState =
  | { status: 'idle' | 'loading' | 'ready' | 'error' }
  | { status: 'locked'; uid: number; username: string };
