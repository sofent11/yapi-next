import { normalizeHeaderRow, normalizeSimpleParam, safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';

// Extracted from index.tsx
export function createYapiJsonImporter(): ImportDataItem {
  return {
    name: 'json',
    desc: 'YApi JSON 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Array<Record<string, unknown>>>(content, []);
      const cats: Array<{ name: string; desc?: string }> = [];
      const apis: Array<Record<string, unknown>> = [];
      source.forEach(item => {
        const catname = toStringValue(item.name || '默认分类') || '默认分类';
        cats.push({
          name: catname,
          desc: toStringValue(item.desc || '')
        });
        const list = Array.isArray(item.list) ? (item.list as Array<Record<string, unknown>>) : [];
        list.forEach(api => {
          apis.push({
            ...api,
            catname
          });
        });
      });
      return { cats, apis };
    }
  };
}
