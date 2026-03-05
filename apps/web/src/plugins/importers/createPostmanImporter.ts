import { normalizeHeaderRow, normalizeSimpleParam, safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';

// Extracted from index.tsx
export function createPostmanImporter(): ImportDataItem {
  return {
    name: 'Postman',
    desc: 'Postman Collection 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Record<string, unknown>>(content, {});
      const apis: Array<Record<string, unknown>> = [];
      const cats: Array<{ name: string; desc?: string }> = [];

      function pushApiFromRequest(
        request: Record<string, unknown>,
        title: string,
        folderName?: string,
        responseExample?: Record<string, unknown>
      ) {
        const method = toStringValue(request.method || 'GET').toUpperCase();
        const urlValue = request.url;
        const rawUrl =
          typeof urlValue === 'string'
            ? urlValue
            : toStringValue((urlValue as Record<string, unknown>)?.raw || '');
        const path = normalizePath(rawUrl);
        const queryList = (
          Array.isArray((urlValue as Record<string, unknown>)?.query)
            ? ((urlValue as Record<string, unknown>).query as unknown[])
            : []
        ) as unknown[];
        const queryParams = queryList
          .map((item: unknown) => {
            const row = item as Record<string, unknown>;
            return {
              name: toStringValue(row.key),
              value: toStringValue(row.value),
              required: row.disabled ? '0' : '1',
              desc: toStringValue(row.description)
            };
          })
          .filter((item: { name: string }) => item.name);
        const headers = normalizeHeaderRow((request as Record<string, unknown>).header).map(item => ({
          ...item,
          required: '1'
        }));
        const contentType = headers.find(item => item.name.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
        const body = (request.body || {}) as Record<string, unknown>;
        const bodyMode = toStringValue(body.mode);
        let reqBodyType: 'form' | 'json' | 'raw' = 'raw';
        let reqBodyForm: Array<Record<string, unknown>> = [];
        let reqBodyOther = '';
        let reqBodyIsJsonSchema = false;
        if (bodyMode === 'urlencoded' || bodyMode === 'formdata') {
          reqBodyType = 'form';
          const rows = Array.isArray(body[bodyMode]) ? (body[bodyMode] as unknown[]) : [];
          reqBodyForm = rows
            .map(item => {
              const row = item as Record<string, unknown>;
              return {
                name: toStringValue(row.key),
                value: toStringValue(row.value),
                required: row.disabled ? '0' : '1',
                desc: toStringValue(row.description),
                type: bodyMode === 'formdata' ? toStringValue(row.type || 'text') : 'text'
              };
            })
            .filter(item => item.name);
        } else if (bodyMode === 'raw') {
          const raw = toStringValue(body.raw);
          const schemaText =
            contentType.includes('application/json') || raw.trim().startsWith('{') || raw.trim().startsWith('[')
              ? inferDraft4SchemaTextFromJsonText(raw)
              : null;
          reqBodyOther = schemaText || raw;
          reqBodyType = schemaText ? 'json' : 'raw';
          reqBodyIsJsonSchema = Boolean(schemaText);
        }

        const firstResponseBody = toStringValue(responseExample?.body || '');
        const responseSchemaText = inferDraft4SchemaTextFromJsonText(firstResponseBody);
        apis.push({
          title: title || path,
          path,
          method,
          catname: folderName || '默认分类',
          req_query: queryParams,
          req_headers: headers,
          req_body_type: reqBodyType,
          req_body_form: reqBodyForm,
          req_body_other: reqBodyOther,
          req_body_is_json_schema: reqBodyIsJsonSchema,
          res_body_type: responseSchemaText ? 'json' : 'raw',
          res_body: responseSchemaText || firstResponseBody,
          res_body_is_json_schema: Boolean(responseSchemaText),
          desc: toStringValue(request.description || '')
        });
      }

      function walkItems(items: unknown[], folderName?: string) {
        items.forEach(rawItem => {
          const item = rawItem as Record<string, unknown>;
          if (Array.isArray(item.item)) {
            const name = toStringValue(item.name || folderName || '默认分类') || '默认分类';
            cats.push({ name, desc: toStringValue(item.description || '') });
            walkItems(item.item as unknown[], name);
            return;
          }
          const request = (item.request || {}) as Record<string, unknown>;
          if (!request || Object.keys(request).length === 0) return;
          const responses = Array.isArray(item.response) ? (item.response as Array<Record<string, unknown>>) : [];
          pushApiFromRequest(request, toStringValue(item.name || ''), folderName, responses[0]);
        });
      }

      if (Array.isArray(source.item)) {
        walkItems(source.item, '默认分类');
      }

      if (Array.isArray(source.requests)) {
        (source.requests as Array<Record<string, unknown>>).forEach(item => {
          pushApiFromRequest(item, toStringValue(item.name || ''), '默认分类');
        });
      }

      if (cats.length === 0) {
        cats.push({ name: '默认分类' });
      }

      return { apis, cats };
    }
  };
}
