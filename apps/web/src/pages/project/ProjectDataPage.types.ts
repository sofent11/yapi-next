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

export type LegacyImportParam = Record<string, unknown> & {
  name?: string;
  value?: unknown;
  example?: unknown;
  required?: string | number | boolean;
  type?: string;
  desc?: string;
};

export type LegacyImportApi = Record<string, unknown> & {
  title?: string;
  path?: string;
  method?: string;
  catname?: string;
  desc?: string;
  req_params?: LegacyImportParam[];
  req_query?: LegacyImportParam[];
  req_headers?: LegacyImportParam[];
  req_body_type?: string;
  req_body_form?: LegacyImportParam[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: string;
  res_body?: string;
  res_body_is_json_schema?: boolean;
};

export type LegacyImportPayload = {
  cats: Array<{ name?: string; desc?: string }>;
  apis: LegacyImportApi[];
};
