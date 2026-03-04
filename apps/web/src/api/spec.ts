import type {
  ApiResult,
  SpecExportQuery,
  SpecImportRequest,
  SpecImportResult,
  SpecImportTaskDTO
} from '@yapi-next/shared-types';

const API_PREFIX = '/api/spec';

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init
  });
  const data = (await response.json()) as ApiResult<T>;
  return data;
}

export async function importSpec(
  payload: SpecImportRequest
): Promise<ApiResult<SpecImportResult | Pick<SpecImportTaskDTO, 'task_id' | 'status' | 'progress'>>> {
  return requestJson(`${API_PREFIX}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function getImportTask(query: {
  task_id: string;
  project_id?: number;
  token?: string;
}): Promise<ApiResult<SpecImportTaskDTO>> {
  const params = new URLSearchParams();
  params.set('task_id', query.task_id);
  if (typeof query.project_id === 'number') {
    params.set('project_id', String(query.project_id));
  }
  if (query.token) {
    params.set('token', query.token);
  }
  return requestJson(`${API_PREFIX}/import/task?${params.toString()}`);
}

export async function exportSpec(
  query: SpecExportQuery
): Promise<ApiResult<Record<string, unknown>>> {
  const params = new URLSearchParams();
  params.set('project_id', String(query.project_id));
  if (query.format) {
    params.set('format', query.format);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.withWiki === true) {
    params.set('withWiki', 'true');
  }
  if (query.token) {
    params.set('token', query.token);
  }
  return requestJson(`${API_PREFIX}/export?${params.toString()}`);
}
