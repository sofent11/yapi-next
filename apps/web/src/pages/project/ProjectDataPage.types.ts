import type { SpecImportResult } from '@yapi-next/shared-types';

export type ProjectDataPageProps = {
  projectId: number;
  token?: string;
};

export type SpecSource = 'json' | 'url';
export type SpecFormat = 'auto' | 'swagger2' | 'openapi3';
export type SyncMode = 'normal' | 'good' | 'merge';

export type ExportFormat = 'openapi3' | 'swagger2';
export type ExportStatus = 'all' | 'open';
export type ImportInputOverrides = Partial<{
  jsonText: string;
  urlText: string;
}>;

export type ImportParam = Record<string, unknown> & {
  name?: string;
  value?: unknown;
  example?: unknown;
  required?: string | number | boolean;
  type?: string;
  desc?: string;
};

export type ImportApi = Record<string, unknown> & {
  title?: string;
  path?: string;
  method?: string;
  catname?: string;
  desc?: string;
  req_params?: ImportParam[];
  req_query?: ImportParam[];
  req_headers?: ImportParam[];
  req_body_type?: string;
  req_body_form?: ImportParam[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: string;
  res_body?: string;
  res_body_is_json_schema?: boolean;
};

export type ImportPayload = {
  cats: Array<{ name?: string; desc?: string }>;
  apis: ImportApi[];
};
