export type CollectionCaseRow = {
  _id?: string | number;
  id?: string | number;
  casename?: string;
  method?: string;
  path?: string;
  title?: string;
  up_time?: number | string;
  interface_id?: number;
  interfaceId?: number;
  project_id?: number;
  col_id?: number;
  case_env?: string;
  req_params?: unknown[];
  req_headers?: unknown[];
  req_query?: unknown[];
  req_body_form?: unknown[];
  req_body_type?: string;
  req_body_other?: string;
  test_script?: string;
  enable_script?: boolean;
  [key: string]: unknown;
};

export type CollectionRow = {
  _id?: number;
  name?: string;
  desc?: string;
  caseList?: CollectionCaseRow[];
  checkHttpCodeIs200?: boolean;
  checkResponseSchema?: boolean;
  checkResponseField?: {
    enable?: boolean;
    name?: string;
    value?: string | number;
  };
  checkScript?: {
    enable?: boolean;
    content?: string;
  };
  [key: string]: unknown;
};

export type AutoTestResultRow = {
  id: string;
  name: string;
  path: string;
  code: number;
  status?: number | null;
  statusText?: string;
  validRes?: Array<{ message?: string }>;
  params?: unknown;
  res_header?: unknown;
  res_body?: unknown;
  interface_id?: number;
  interfaceId?: number;
  [key: string]: unknown;
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
  list?: AutoTestResultRow[];
};

export type CaseEnvProject = {
  _id: number;
  name: string;
  env?: Array<{ name?: string; domain?: string }>;
};

export type CaseDetailData = {
  _id?: string | number;
  id?: string | number;
  casename?: string;
  method?: string;
  path?: string;
  title?: string;
  interface_id?: number;
  project_id?: number;
  req_params?: unknown[];
  req_headers?: unknown[];
  req_query?: unknown[];
  req_body_form?: unknown[];
  req_body_type?: string;
  req_body_other?: string;
  case_env?: string;
  enable_script?: boolean;
  test_script?: string;
  [key: string]: unknown;
};

export type ColFormValues = {
  name: string;
  desc?: string;
};

export type AddCaseFormValues = {
  interface_id: number;
  casename: string;
  case_env?: string;
};

export type CommonSettingFormValues = {
  checkHttpCodeIs200: boolean;
  checkResponseSchema: boolean;
  checkResponseFieldEnable: boolean;
  checkResponseFieldName: string;
  checkResponseFieldValue: string;
  checkScriptEnable: boolean;
  checkScriptContent: string;
};

export type CaseEditFormValues = {
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
