import { QueryStringArrayFormat } from './types';
import type { Config, ConfigWithHooks, RequestConfig, RequestFunctionParams } from './types';

export function defineConfig(config: Config, hooks?: ConfigWithHooks['hooks']): ConfigWithHooks {
  if (hooks) {
    Object.defineProperty(config, 'hooks', {
      value: hooks,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }
  return config as ConfigWithHooks;
}

export class FileData<T = any> {
  constructor(
    private readonly originalFileData: T,
    private readonly options?: Record<string, any>
  ) {}

  getOriginalFileData(): T {
    return this.originalFileData;
  }

  getOptions(): Record<string, any> | undefined {
    return this.options;
  }
}

export function parseRequestData(requestData?: any): { data: any; fileData: Record<string, any> } {
  const result = {
    data: {} as any,
    fileData: {} as Record<string, any>
  };

  if (requestData == null) {
    return result;
  }

  if (typeof requestData !== 'object' || Array.isArray(requestData)) {
    result.data = requestData;
    return result;
  }

  Object.keys(requestData).forEach(key => {
    if (requestData[key] instanceof FileData) {
      result.fileData[key] = requestData[key].getOriginalFileData();
    } else {
      result.data[key] = requestData[key];
    }
  });
  return result;
}

function queryStringify(key: string, value: any, arrayFormat: QueryStringArrayFormat): string {
  if (value == null) return '';
  if (!Array.isArray(value)) {
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
  if (arrayFormat === QueryStringArrayFormat.indices) {
    return value.map((v, i) => `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(v)}`).join('&');
  }
  if (arrayFormat === QueryStringArrayFormat.repeat) {
    return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&');
  }
  if (arrayFormat === QueryStringArrayFormat.comma) {
    return `${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`;
  }
  if (arrayFormat === QueryStringArrayFormat.json) {
    return `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`;
  }
  return value.map(v => `${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(v)}`).join('&');
}

export function prepare(requestConfig: RequestConfig, requestData: any): RequestFunctionParams {
  let requestPath = requestConfig.path;
  const { data, fileData } = parseRequestData(requestData);
  const dataIsObject = data != null && typeof data === 'object' && !Array.isArray(data);

  if (dataIsObject) {
    if (Array.isArray(requestConfig.paramNames) && requestConfig.paramNames.length > 0) {
      Object.keys(data).forEach(key => {
        if (requestConfig.paramNames.includes(key)) {
          requestPath = requestPath
            .replace(new RegExp(`\\{${key}\\}`, 'g'), data[key])
            .replace(new RegExp(`/:${key}(?=/|$)`, 'g'), `/${data[key]}`);
          delete data[key];
        }
      });
    }

    let queryString = '';
    if (Array.isArray(requestConfig.queryNames) && requestConfig.queryNames.length > 0) {
      Object.keys(data).forEach(key => {
        if (requestConfig.queryNames.includes(key)) {
          const fragment = queryStringify(key, data[key], requestConfig.queryStringArrayFormat);
          if (fragment) {
            queryString += `${queryString ? '&' : ''}${fragment}`;
          }
          delete data[key];
        }
      });
    }

    if (queryString) {
      requestPath += `${requestPath.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  const allData = {
    ...(dataIsObject ? data : {}),
    ...fileData
  };

  const getFormData = () => {
    const FormDataCtor = typeof FormData !== 'undefined' ? FormData : require('form-data');
    const formData = new FormDataCtor();
    Object.keys(data || {}).forEach(key => formData.append(key, data[key]));
    Object.keys(fileData).forEach(key => {
      const options = requestData[key]?.getOptions?.();
      const files = Array.isArray(fileData[key]) ? fileData[key] : [fileData[key]];
      files.forEach((file: any) => formData.append(key, file, options));
    });
    return formData;
  };

  return {
    ...requestConfig,
    path: requestPath,
    rawData: requestData,
    data,
    hasFileData: Object.keys(fileData).length > 0,
    fileData,
    allData,
    getFormData
  };
}
