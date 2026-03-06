import { normalizeHeaderRow, normalizeSimpleParam, safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { AppRouteContract } from '../../types/route-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';

// Extracted from index.tsx
export function createHarImporter(): ImportDataItem {
  return {
    name: 'Har',
    desc: 'Har 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Record<string, unknown>>(content, {});
      const entries = Array.isArray((source.log as Record<string, unknown> | undefined)?.entries)
        ? ((source.log as Record<string, unknown>).entries as Array<Record<string, unknown>>)
        : [];
      const apis: Array<Record<string, unknown>> = [];

      entries.forEach(entry => {
        const request = (entry.request || {}) as Record<string, unknown>;
        const response = (entry.response || {}) as Record<string, unknown>;
        const url = toStringValue(request.url);
        const path = normalizePath(url);
        const method = toStringValue(request.method || 'GET').toUpperCase();
        const queryParams = normalizeSimpleParam(request.queryString);
        const headers = normalizeHeaderRow(request.headers).map(item => ({
          ...item,
          required: '1',
          desc: ''
        }));
        const postData = (request.postData || {}) as Record<string, unknown>;
        const mime = toStringValue(postData.mimeType).toLowerCase();
        const bodyText = toStringValue(postData.text);
        let reqBodyType: 'form' | 'json' | 'raw' = 'raw';
        let reqBodyForm: Array<Record<string, unknown>> = [];
        let reqBodyOther = bodyText;
        let reqBodyIsJsonSchema = false;
        if (mime.includes('form-urlencoded') || mime.includes('multipart/form-data')) {
          reqBodyType = 'form';
          reqBodyForm = normalizeSimpleParam(postData.params).map(item => ({ ...item, type: 'text' }));
        } else if (mime.includes('application/json')) {
          reqBodyType = 'json';
          const schemaText = inferDraft4SchemaTextFromJsonText(bodyText);
          if (schemaText) {
            reqBodyOther = schemaText;
            reqBodyIsJsonSchema = true;
          }
        }
        const responseContent = (response.content || {}) as Record<string, unknown>;
        let responseText = toStringValue(responseContent.text || '');
        if (toStringValue(responseContent.encoding).toLowerCase() === 'base64' && responseText) {
          try {
            responseText = atob(responseText);
          } catch (_err) {
            // Keep original response text when base64 decode fails.
          }
        }
        const responseSchemaText = inferDraft4SchemaTextFromJsonText(responseText);
        apis.push({
          title: path,
          path,
          method,
          catname: '默认分类',
          req_query: queryParams,
          req_headers: headers,
          req_body_type: reqBodyType,
          req_body_form: reqBodyForm,
          req_body_other: reqBodyOther,
          req_body_is_json_schema: reqBodyIsJsonSchema,
          res_body_type: responseSchemaText ? 'json' : 'raw',
          res_body: responseSchemaText || responseText,
          res_body_is_json_schema: Boolean(responseSchemaText),
          desc: ''
        });
      });

      return { apis, cats: [{ name: '默认分类' }] };
    }
  };
}
