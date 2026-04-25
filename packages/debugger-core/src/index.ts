import YAML from 'yaml';
import { buildImportJourneyState, evaluateSyncGuard } from './beta';
import {
  BODY_SIDECAR_THRESHOLD,
  CASE_SUFFIX,
  COLLECTION_SUFFIX,
  DEFAULT_GITIGNORE,
  FOLDER_CONFIG_FILE,
  LOCAL_ENV_SUFFIX,
  REQUEST_SUFFIX,
  SCHEMA_VERSION,
  collectionRunReportSchema,
  collectionDocumentSchema,
  collectionStepSchema,
  authConfigSchema,
  checkResultSchema,
  caseCheckSchema,
  caseDocumentSchema,
  createDefaultEnvironment,
  createEmptyCollection,
  createDefaultProject,
  createId,
  emptyParameterRow,
  environmentDocumentSchema,
  folderDocumentSchema,
  projectDocumentSchema,
  retryPolicySchema,
  resolvedAuthPreviewItemSchema,
  resolvedFieldValueSchema,
  resolvedRequestInsightSchema,
  resolvedRequestPreviewSchema,
  runtimeSettingsSchema,
  sendRequestInputSchema,
  sendRequestResultSchema,
  requestBodySchema,
  requestDocumentSchema,
  slugify,
  type AuthConfig,
  type CaseCheck,
  type CaseDocument,
  type CheckResult,
  type CollectionDocument,
  type CollectionRunReport,
  type CollectionStep,
  type CollectionStepRun,
  type EnvironmentDocument,
  type FolderDocument,
  type ParameterRow,
  type ProjectDocument,
  type RequestBody,
  type RequestDocument,
  type RequestKind,
  type RequestScripts,
  type ResolvedAuthPreviewItem,
  type ResolvedFieldValue,
  type ResolvedRequestInsight,
  type ResolvedRequestPreview,
  type RetryPolicy,
  type ResponseExample,
  type ScriptLog,
  type SendRequestInput,
  type SendRequestResult,
  type WorkspaceCollectionRecord,
  type WorkspaceEnvironmentRecord,
  type WorkspaceFolderRecord,
  type WorkspaceIndex,
  type WorkspaceRequestRecord,
  type WorkspaceTreeNode
} from '@yapi-debugger/schema';
import {
  applyCollectionRules,
  buildCurlCommand,
  evaluateChecks,
  executeRequestScript,
  interpolateResolvedRequest,
  interpolateString,
  mergeTemplateSources,
  readPathValue,
  type ScriptExecutionFlow
} from './runtime';

export type FileEntry = {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  children?: FileEntry[];
};

export type WorkspaceFileWrite = {
  path: string;
  content: string;
};

export type ProjectSeed = {
  projectName: string;
  includeSampleRequest?: boolean;
};

export type ResolvedRequest = ResolvedRequestPreview;

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const NTLM_DESKTOP_CONSTRAINT_DETAIL =
  'Desktop NTLM currently supports explicit username/password credentials only. Native OS/integrated enterprise flows (SSPI, GSSAPI, Negotiate/Kerberos) are not available in this build.';
const UNSUPPORTED_SCRIPT_PATTERNS = [
  {
    token: 'pm.sendRequest',
    code: 'script-unsupported-send-request',
    level: 'warning' as const,
    message: 'pm.sendRequest is only supported in lite pre-request mode. Complex or post-response usage still needs review.'
  },
  {
    token: 'pm.execution.setNextRequest',
    code: 'script-limited-set-next-request',
    level: 'warning' as const,
    message: 'pm.execution.setNextRequest is supported only during collection runs, and only for forward step key/name/request targets or null stop.'
  },
  {
    token: 'pm.globals',
    code: 'script-unsupported-globals',
    level: 'warning' as const,
    message: 'pm.globals is not supported by the local debugger runtime yet.'
  },
  {
    token: 'pm.vault',
    code: 'script-unsupported-vault',
    level: 'warning' as const,
    message: 'pm.vault is not supported by the local debugger runtime yet.'
  },
  {
    token: 'pm.visualizer',
    code: 'script-unsupported-visualizer',
    level: 'warning' as const,
    message: 'pm.visualizer is not supported by the local debugger runtime yet.'
  },
  {
    token: 'pm.require',
    code: 'script-unsupported-require',
    level: 'warning' as const,
    message: 'pm.require is not supported by the local debugger runtime yet.'
  },
  {
    token: 'postman.setNextRequest',
    code: 'script-limited-legacy-set-next-request',
    level: 'warning' as const,
    message: 'postman.setNextRequest is supported only during collection runs, with the same forward-only target limits as pm.execution.setNextRequest.'
  },
  {
    token: 'postman.',
    code: 'script-legacy-postman-api',
    level: 'warning' as const,
    message: 'Legacy postman.* APIs may not execute correctly in the local debugger runtime.'
  }
];

export function parseYamlDocument<T>(content: string): T {
  return YAML.parse(content) as T;
}

export function stringifyYamlDocument(input: unknown) {
  return YAML.stringify(input, {
    defaultKeyType: 'PLAIN',
    lineWidth: 100
  });
}

function parseRequestFile(_filePath: string, content: string): RequestDocument {
  const input = parseYamlDocument<unknown>(content);
  return requestDocumentSchema.parse(input);
}

function parseCaseFile(_filePath: string, content: string): CaseDocument {
  const input = parseYamlDocument<unknown>(content);
  return caseDocumentSchema.parse(input);
}

function parseCollectionFile(_filePath: string, content: string): CollectionDocument {
  const input = parseYamlDocument<unknown>(content);
  return collectionDocumentSchema.parse(input);
}

function parseEnvironmentFile(filePath: string, content: string): EnvironmentDocument {
  const input = parseYamlDocument<unknown>(content);
  const parsed = environmentDocumentSchema.parse(input);
  if (filePath.endsWith(LOCAL_ENV_SUFFIX)) {
    return environmentDocumentSchema.parse({
      ...parsed,
      name: parsed.name || filePath.split('/').pop()?.replace(LOCAL_ENV_SUFFIX, '') || 'local'
    });
  }
  return parsed;
}

function parseFolderFile(_filePath: string, content: string): FolderDocument {
  const input = parseYamlDocument<unknown>(content);
  return folderDocumentSchema.parse(input);
}

function environmentStem(filePath: string) {
  const fileName = filePath.split('/').pop() || '';
  if (fileName.endsWith(LOCAL_ENV_SUFFIX)) {
    return fileName.slice(0, -LOCAL_ENV_SUFFIX.length);
  }
  if (fileName.endsWith('.yaml')) {
    return fileName.slice(0, -'.yaml'.length);
  }
  if (fileName.endsWith('.yml')) {
    return fileName.slice(0, -'.yml'.length);
  }
  return fileName;
}

function mergeHeaderRowsByName(sharedRows: ParameterRow[], localRows: ParameterRow[]) {
  const output = [...cleanRows(sharedRows)];
  const indexByName = new Map(output.map((row, index) => [row.name.trim().toLowerCase(), index]));
  cleanRows(localRows).forEach(row => {
    const key = row.name.trim().toLowerCase();
    const existingIndex = indexByName.get(key);
    if (existingIndex == null) {
      indexByName.set(key, output.length);
      output.push(row);
      return;
    }
    output[existingIndex] = row;
  });
  return output;
}

function mergeEnvironmentDocuments(
  sharedDocument: EnvironmentDocument,
  sharedFilePath: string,
  localDocument?: EnvironmentDocument,
  localFilePath?: string
) {
  const sharedVars = { ...(sharedDocument.vars || {}) };
  const localVars = { ...(localDocument?.vars || {}) };
  return environmentDocumentSchema.parse({
    ...sharedDocument,
    name: sharedDocument.name || localDocument?.name || environmentStem(sharedFilePath),
    vars: {
      ...sharedVars,
      ...localVars
    },
    headers: mergeHeaderRowsByName(sharedDocument.headers || [], localDocument?.headers || []),
    authProfiles: sharedDocument.authProfiles || [],
    sharedVars,
    sharedHeaders: cleanRows(sharedDocument.headers || []),
    localVars,
    localHeaders: cleanRows(localDocument?.headers || []),
    sharedFilePath,
    localFilePath,
    overlayMode: localDocument ? 'overlay' : 'standalone'
  });
}

function pathSegmentsBetween(root: string, target: string) {
  return target
    .replace(root, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
}

function sortRecords<T extends { path?: string; name?: string }>(items: T[]) {
  return [...items].sort((left: T, right: T) => {
    const leftKey = left.path || left.name || '';
    const rightKey = right.path || right.name || '';
    return leftKey.localeCompare(rightKey, 'zh-CN');
  });
}

type ScanFilesInput = {
  root: string;
  projectContent: string;
  fileContents: Record<string, string>;
};

export const GRAPHQL_INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      fields(includeDeprecated: true) {
        name
        args {
          name
          defaultValue
          type {
            ...TypeRef
          }
        }
        type {
          ...TypeRef
        }
      }
      inputFields {
        name
        defaultValue
        type {
          ...TypeRef
        }
      }
      enumValues(includeDeprecated: true) {
        name
      }
      possibleTypes {
        kind
        name
      }
    }
  }
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
}
`.trim();

export type GraphqlFieldArgumentSummary = {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  placeholder?: unknown;
};

export type GraphqlSelectionKind = 'scalar' | 'enum' | 'object' | 'interface' | 'union';

export type GraphqlSelectionFragmentSummary = {
  typeName: string;
  selection: GraphqlSelectionFieldSummary[];
};

export type GraphqlSelectionFieldSummary = {
  name: string;
  returnType: string;
  kind: GraphqlSelectionKind;
  children: GraphqlSelectionFieldSummary[];
  fragments: GraphqlSelectionFragmentSummary[];
};

export type GraphqlOperationFieldSummary = {
  name: string;
  args: GraphqlFieldArgumentSummary[];
  returnType: string;
  selection: string[];
  selectionTree: GraphqlSelectionFieldSummary[];
  selectionFragments: GraphqlSelectionFragmentSummary[];
};

export type GraphqlSchemaSummary = {
  ok: boolean;
  typeCount: number;
  queryType?: string;
  mutationType?: string;
  subscriptionType?: string;
  queries: string[];
  mutations: string[];
  subscriptions: string[];
  queryFields: GraphqlOperationFieldSummary[];
  mutationFields: GraphqlOperationFieldSummary[];
  subscriptionFields: GraphqlOperationFieldSummary[];
  warnings: string[];
};

export type GraphqlOperationKind = 'query' | 'mutation' | 'subscription';

export type GraphqlOperationDraft = {
  query: string;
  variables: string;
  operationName: string;
};

export type GraphqlFragmentStyle = 'inline' | 'named';

export type GraphqlOperationDraftOptions = {
  selectedFields?: string[];
  selectedFragments?: string[];
  fragmentStyle?: GraphqlFragmentStyle;
};

function ensureHeader(rows: ParameterRow[], name: string, value: string) {
  if (rows.some(row => row.enabled && row.name.trim().toLowerCase() === name.toLowerCase())) {
    return rows;
  }
  return [...rows, { name, value, enabled: true, kind: 'text' as const }];
}

type GraphqlIntrospectionTypeRef = {
  kind?: string | null;
  name?: string | null;
  ofType?: GraphqlIntrospectionTypeRef | null;
};

type GraphqlIntrospectionField = {
  name?: unknown;
  args?: unknown;
  type?: GraphqlIntrospectionTypeRef | null;
};

type GraphqlIntrospectionInputValue = {
  name?: unknown;
  defaultValue?: unknown;
  type?: GraphqlIntrospectionTypeRef | null;
};

type GraphqlIntrospectionEnumValue = {
  name?: unknown;
};

type GraphqlIntrospectionType = {
  kind?: unknown;
  name?: unknown;
  fields?: unknown;
  inputFields?: unknown;
  enumValues?: unknown;
  possibleTypes?: unknown;
};

function namedGraphqlType(typeRef: GraphqlIntrospectionTypeRef | null | undefined): string {
  if (!typeRef) return '';
  if (typeRef.name) return typeRef.name;
  return namedGraphqlType(typeRef.ofType);
}

function formatGraphqlType(typeRef: GraphqlIntrospectionTypeRef | null | undefined): string {
  if (!typeRef) return 'JSON';
  if (typeRef.kind === 'NON_NULL') return `${formatGraphqlType(typeRef.ofType)}!`;
  if (typeRef.kind === 'LIST') return `[${formatGraphqlType(typeRef.ofType)}]`;
  return typeRef.name || 'JSON';
}

function isGraphqlRequired(typeRef: GraphqlIntrospectionTypeRef | null | undefined) {
  return typeRef?.kind === 'NON_NULL';
}

function schemaTypeKind(schemaType: unknown) {
  return String((schemaType as { kind?: unknown })?.kind || '');
}

function selectionKindForSchemaType(kind: string): GraphqlSelectionKind {
  if (kind === 'ENUM') return 'enum';
  if (kind === 'INTERFACE') return 'interface';
  if (kind === 'UNION') return 'union';
  if (kind === 'OBJECT') return 'object';
  return 'scalar';
}

function isGraphqlLeafType(typeRef: GraphqlIntrospectionTypeRef | null | undefined, byName: Map<string, unknown>) {
  const namedType = namedGraphqlType(typeRef);
  const schemaType = byName.get(namedType);
  const kind = schemaTypeKind(schemaType);
  return kind === 'SCALAR' || kind === 'ENUM';
}

function selectableGraphqlFieldsFromSchemaType(schemaType: unknown) {
  const fields = (schemaType as { fields?: unknown })?.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map(field => field as GraphqlIntrospectionField)
    .filter(field => {
      const args = Array.isArray(field.args) ? field.args : [];
      return args.length === 0 && typeof field.name === 'string' && field.name.trim().length > 0;
    });
}

function selectableGraphqlFields(typeRef: GraphqlIntrospectionTypeRef | null | undefined, byName: Map<string, unknown>) {
  const namedType = namedGraphqlType(typeRef);
  const schemaType = byName.get(namedType);
  return selectableGraphqlFieldsFromSchemaType(schemaType);
}

function indentGraphqlLines(lines: string[], spaces = 2) {
  const prefix = ' '.repeat(spaces);
  return lines
    .flatMap(line => line.split('\n'))
    .map(line => `${prefix}${line}`)
    .join('\n');
}

function fieldNames(schemaType: unknown) {
  const fields = (schemaType as { fields?: unknown })?.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map(field => (field as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .slice(0, 48);
}

function possibleGraphqlTypes(schemaType: unknown, byName: Map<string, unknown>) {
  const possibleTypes = (schemaType as GraphqlIntrospectionType)?.possibleTypes;
  if (!Array.isArray(possibleTypes)) return [];
  return possibleTypes
    .map(type => String((type as GraphqlIntrospectionTypeRef)?.name || ''))
    .filter(name => name.length > 0 && byName.has(name))
    .slice(0, 8);
}

function graphqlSelectionKindForTypeRef(
  typeRef: GraphqlIntrospectionTypeRef | null | undefined,
  byName: Map<string, unknown>
): GraphqlSelectionKind {
  const namedType = namedGraphqlType(typeRef);
  const schemaType = byName.get(namedType);
  const kind = schemaTypeKind(schemaType);
  return selectionKindForSchemaType(kind);
}

function buildGraphqlSelectionTree(
  typeRef: GraphqlIntrospectionTypeRef | null | undefined,
  byName: Map<string, unknown>,
  input: {
    depth: number;
    path: Set<string>;
    maxFields: number;
  }
): {
  children: GraphqlSelectionFieldSummary[];
  fragments: GraphqlSelectionFragmentSummary[];
} {
  const namedType = namedGraphqlType(typeRef);
  const schemaType = byName.get(namedType);
  const kind = schemaTypeKind(schemaType);
  if (!namedType || kind === 'SCALAR' || kind === 'ENUM') {
    return { children: [], fragments: [] };
  }
  if (input.path.has(namedType) || input.depth <= 0) {
    const children =
      kind === 'OBJECT' || kind === 'INTERFACE'
        ? selectableGraphqlFieldsFromSchemaType(schemaType)
            .filter(field => isGraphqlLeafType(field.type, byName))
            .slice(0, input.maxFields)
            .map(field => ({
              name: String(field.name),
              returnType: formatGraphqlType(field.type),
              kind: graphqlSelectionKindForTypeRef(field.type, byName),
              children: [],
              fragments: []
            }) satisfies GraphqlSelectionFieldSummary)
        : [];
    return { children, fragments: [] };
  }

  const nextPath = new Set([...input.path, namedType]);
  const children =
    kind === 'OBJECT' || kind === 'INTERFACE'
      ? selectableGraphqlFieldsFromSchemaType(schemaType)
          .slice(0, input.maxFields)
          .map(field => {
            const nested = buildGraphqlSelectionTree(field.type, byName, {
              depth: input.depth - 1,
              path: nextPath,
              maxFields: 6
            });
            return {
              name: String(field.name),
              returnType: formatGraphqlType(field.type),
              kind: graphqlSelectionKindForTypeRef(field.type, byName),
              children: nested.children,
              fragments: nested.fragments
            } satisfies GraphqlSelectionFieldSummary;
          })
      : [];
  const fragments =
    kind === 'INTERFACE' || kind === 'UNION'
      ? possibleGraphqlTypes(schemaType, byName).map(typeName => ({
          typeName,
          selection: buildGraphqlSelectionTree({ kind: 'OBJECT', name: typeName }, byName, {
            depth: input.depth - 1,
            path: nextPath,
            maxFields: 6
          }).children
        }))
      : [];
  return { children, fragments };
}

export function graphqlSelectionPath(basePath: string, fieldName: string) {
  return basePath ? `${basePath}.${fieldName}` : fieldName;
}

export function graphqlFragmentPath(basePath: string, typeName: string) {
  return `${basePath}::${typeName}`;
}

function renderGraphqlSelectionNode(
  node: GraphqlSelectionFieldSummary,
  input: {
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
): string | null {
  const nodePath = graphqlSelectionPath(input.basePath, node.name);
  if (input.selectedFields && !input.selectedFields.has(nodePath)) {
    return null;
  }
  const childLines = renderGraphqlSelectionNodes(node.children, {
    basePath: nodePath,
    selectedFields: input.selectedFields,
    selectedFragments: input.selectedFragments
  });
  const fragmentLines = renderGraphqlSelectionFragments(node.fragments, {
    basePath: nodePath,
    selectedFields: input.selectedFields,
    selectedFragments: input.selectedFragments
  });
  const selectionLines = [...childLines, ...fragmentLines];
  if (selectionLines.length === 0) {
    if (node.kind === 'scalar' || node.kind === 'enum') {
      return node.name;
    }
    return `${node.name} {\n  __typename\n}`;
  }
  return `${node.name} {\n${indentGraphqlLines(selectionLines, 2)}\n}`;
}

function renderGraphqlSelectionNodes(
  nodes: GraphqlSelectionFieldSummary[],
  input: {
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
) {
  return nodes
    .map(node => renderGraphqlSelectionNode(node, input))
    .filter((line): line is string => Boolean(line));
}

function renderGraphqlSelectionFragments(
  fragments: GraphqlSelectionFragmentSummary[],
  input: {
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
) {
  return fragments
    .map(fragment => {
      const fragmentPath = graphqlFragmentPath(input.basePath, fragment.typeName);
      if (input.selectedFragments && !input.selectedFragments.has(fragmentPath)) {
        return null;
      }
      const childLines = renderGraphqlSelectionNodes(fragment.selection, {
        basePath: fragmentPath,
        selectedFields: input.selectedFields,
        selectedFragments: input.selectedFragments
      });
      return `... on ${fragment.typeName} {\n${indentGraphqlLines(childLines.length > 0 ? childLines : ['__typename'], 2)}\n}`;
    })
    .filter((line): line is string => Boolean(line));
}

type GraphqlRenderedSelectionResult = {
  lines: string[];
  fragmentDefinitions: Map<string, string>;
};

function graphqlNamedFragmentName(operationName: string, fragmentPath: string, typeName: string) {
  const cleanedPath = fragmentPath.replace(/::/g, ' ').replace(/\./g, ' ').trim();
  const suffix = cleanedPath ? capitalizeGraphqlName(cleanedPath) : capitalizeGraphqlName(typeName);
  return `${operationName}${suffix}Fragment`;
}

function renderGraphqlNamedSelectionNode(
  node: GraphqlSelectionFieldSummary,
  input: {
    operationName: string;
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
): { line: string | null; fragmentDefinitions: Map<string, string> } {
  const nodePath = graphqlSelectionPath(input.basePath, node.name);
  if (input.selectedFields && !input.selectedFields.has(nodePath)) {
    return { line: null, fragmentDefinitions: new Map() };
  }
  const childResult = renderGraphqlNamedSelectionNodes(node.children, {
    operationName: input.operationName,
    basePath: nodePath,
    selectedFields: input.selectedFields,
    selectedFragments: input.selectedFragments
  });
  const fragmentResult = renderGraphqlNamedSelectionFragments(node.fragments, {
    operationName: input.operationName,
    basePath: nodePath,
    selectedFields: input.selectedFields,
    selectedFragments: input.selectedFragments
  });
  const fragmentDefinitions = new Map([
    ...childResult.fragmentDefinitions,
    ...fragmentResult.fragmentDefinitions
  ]);
  const selectionLines = [...childResult.lines, ...fragmentResult.lines];
  if (selectionLines.length === 0) {
    if (node.kind === 'scalar' || node.kind === 'enum') {
      return { line: node.name, fragmentDefinitions };
    }
    return {
      line: `${node.name} {\n  __typename\n}`,
      fragmentDefinitions
    };
  }
  return {
    line: `${node.name} {\n${indentGraphqlLines(selectionLines, 2)}\n}`,
    fragmentDefinitions
  };
}

function renderGraphqlNamedSelectionNodes(
  nodes: GraphqlSelectionFieldSummary[],
  input: {
    operationName: string;
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
): GraphqlRenderedSelectionResult {
  return nodes.reduce<GraphqlRenderedSelectionResult>(
    (output, node) => {
      const rendered = renderGraphqlNamedSelectionNode(node, input);
      if (rendered.line) {
        output.lines.push(rendered.line);
      }
      rendered.fragmentDefinitions.forEach((definition, name) => output.fragmentDefinitions.set(name, definition));
      return output;
    },
    { lines: [], fragmentDefinitions: new Map() }
  );
}

function renderGraphqlNamedSelectionFragments(
  fragments: GraphqlSelectionFragmentSummary[],
  input: {
    operationName: string;
    basePath: string;
    selectedFields?: Set<string>;
    selectedFragments?: Set<string>;
  }
): GraphqlRenderedSelectionResult {
  return fragments.reduce<GraphqlRenderedSelectionResult>(
    (output, fragment) => {
      const fragmentPath = graphqlFragmentPath(input.basePath, fragment.typeName);
      if (input.selectedFragments && !input.selectedFragments.has(fragmentPath)) {
        return output;
      }
      const childResult = renderGraphqlNamedSelectionNodes(fragment.selection, {
        operationName: input.operationName,
        basePath: fragmentPath,
        selectedFields: input.selectedFields,
        selectedFragments: input.selectedFragments
      });
      childResult.fragmentDefinitions.forEach((definition, name) => output.fragmentDefinitions.set(name, definition));
      const fragmentName = graphqlNamedFragmentName(input.operationName, fragmentPath, fragment.typeName);
      output.fragmentDefinitions.set(
        fragmentName,
        `fragment ${fragmentName} on ${fragment.typeName} {\n${indentGraphqlLines(
          childResult.lines.length > 0 ? childResult.lines : ['__typename'],
          2
        )}\n}`
      );
      output.lines.push(`...${fragmentName}`);
      return output;
    },
    { lines: [], fragmentDefinitions: new Map() }
  );
}

function defaultSelectionFieldsForType(typeRef: GraphqlIntrospectionTypeRef | null | undefined, byName: Map<string, unknown>) {
  const tree = buildGraphqlSelectionTree(typeRef, byName, {
    depth: 2,
    path: new Set(),
    maxFields: 8
  });
  const childLines = renderGraphqlSelectionNodes(tree.children, { basePath: '' });
  const fragmentLines = renderGraphqlSelectionFragments(tree.fragments.slice(0, 2), { basePath: '' });
  return [...childLines, ...fragmentLines];
}

function operationFields(schemaType: unknown, byName: Map<string, unknown>): GraphqlOperationFieldSummary[] {
  const fields = (schemaType as { fields?: unknown })?.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map(field => field as GraphqlIntrospectionField)
    .filter(field => typeof field.name === 'string' && field.name.trim().length > 0)
    .map(field => {
      const args = Array.isArray(field.args) ? field.args : [];
      const selectionTree = buildGraphqlSelectionTree(field.type, byName, {
        depth: 3,
        path: new Set(),
        maxFields: 8
      });
      return {
        name: String(field.name),
        args: args
          .map(arg => {
            const source = arg as { name?: unknown; defaultValue?: unknown; type?: GraphqlIntrospectionTypeRef | null };
            return {
              name: String(source.name || ''),
              type: formatGraphqlType(source.type),
              required: isGraphqlRequired(source.type),
              defaultValue: typeof source.defaultValue === 'string' ? source.defaultValue : undefined,
              placeholder: placeholderForGraphqlTypeRef(
                source.type,
                byName,
                typeof source.defaultValue === 'string' ? source.defaultValue : undefined,
                {
                  depth: 3,
                  path: new Set(),
                  maxFields: 16
                }
              )
            };
          })
          .filter(arg => arg.name.trim().length > 0),
          returnType: formatGraphqlType(field.type),
          selection: defaultSelectionFieldsForType(field.type, byName),
          selectionTree: selectionTree.children,
          selectionFragments: selectionTree.fragments
        };
      })
      .slice(0, 48);
}

export function summarizeGraphqlSchema(bodyText: string): GraphqlSchemaSummary {
  const fallback: GraphqlSchemaSummary = {
    ok: false,
    typeCount: 0,
    queries: [],
    mutations: [],
    subscriptions: [],
    queryFields: [],
    mutationFields: [],
    subscriptionFields: [],
    warnings: []
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (_error) {
    return {
      ...fallback,
      warnings: ['The introspection response is not valid JSON.']
    };
  }

  const root = parsed as { data?: { __schema?: unknown }; errors?: unknown };
  const schema = root.data?.__schema as
    | {
        queryType?: { name?: string } | null;
        mutationType?: { name?: string } | null;
        subscriptionType?: { name?: string } | null;
        types?: unknown[];
      }
    | undefined;
  const warnings = Array.isArray(root.errors) && root.errors.length > 0
    ? [`GraphQL returned ${root.errors.length} error${root.errors.length === 1 ? '' : 's'}.`]
    : [];
  if (!schema) {
    return {
      ...fallback,
      warnings: warnings.length > 0 ? warnings : ['The response does not contain data.__schema.']
    };
  }

  const types = Array.isArray(schema.types) ? schema.types : [];
  const byName = new Map(
    types
      .map(type => [String((type as { name?: unknown })?.name || ''), type] as const)
      .filter(([name]) => name.length > 0)
  );
  const queryType = schema.queryType?.name;
  const mutationType = schema.mutationType?.name;
  const subscriptionType = schema.subscriptionType?.name;

  const queryFields = queryType ? operationFields(byName.get(queryType), byName) : [];
  const mutationFields = mutationType ? operationFields(byName.get(mutationType), byName) : [];
  const subscriptionFields = subscriptionType ? operationFields(byName.get(subscriptionType), byName) : [];

  return {
    ok: true,
    typeCount: types.length,
    queryType,
    mutationType,
    subscriptionType,
    queries: queryFields.length > 0 ? queryFields.map(field => field.name) : queryType ? fieldNames(byName.get(queryType)) : [],
    mutations: mutationFields.length > 0 ? mutationFields.map(field => field.name) : mutationType ? fieldNames(byName.get(mutationType)) : [],
    subscriptions:
      subscriptionFields.length > 0 ? subscriptionFields.map(field => field.name) : subscriptionType ? fieldNames(byName.get(subscriptionType)) : [],
    queryFields,
    mutationFields,
    subscriptionFields,
    warnings
  };
}

function capitalizeGraphqlName(input: string) {
  const clean = input.replace(/[^a-zA-Z0-9_]/g, ' ').trim();
  const words = clean ? clean.split(/\s+/) : ['Operation'];
  return words.map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('');
}

function parseGraphqlDefaultValue(defaultValue: string | undefined): unknown {
  if (!defaultValue) return undefined;
  const trimmed = defaultValue.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function placeholderForGraphqlType(type: string, defaultValue?: string): unknown {
  const parsedDefault = parseGraphqlDefaultValue(defaultValue);
  if (parsedDefault !== undefined) return parsedDefault;
  const normalized = type.replace(/[!\[\]]/g, '');
  if (type.startsWith('[')) return [];
  if (normalized === 'Int' || normalized === 'Float') return 0;
  if (normalized === 'Boolean') return false;
  if (normalized === 'ID' || normalized === 'String') return '';
  return null;
}

function graphqlEnumPlaceholder(schemaType: unknown) {
  const enumValues = (schemaType as { enumValues?: unknown })?.enumValues;
  if (!Array.isArray(enumValues)) return '';
  const first = enumValues.find(value => typeof (value as { name?: unknown })?.name === 'string');
  return first ? String((first as { name?: unknown }).name) : '';
}

function placeholderForGraphqlTypeRef(
  typeRef: GraphqlIntrospectionTypeRef | null | undefined,
  byName: Map<string, unknown>,
  defaultValue: string | undefined,
  input: {
    depth: number;
    path: Set<string>;
    maxFields: number;
  }
): unknown {
  const parsedDefault = parseGraphqlDefaultValue(defaultValue);
  if (parsedDefault !== undefined) return parsedDefault;
  if (!typeRef) return null;
  if (typeRef.kind === 'NON_NULL') {
    return placeholderForGraphqlTypeRef(typeRef.ofType, byName, undefined, input);
  }
  if (typeRef.kind === 'LIST') {
    const item = placeholderForGraphqlTypeRef(typeRef.ofType, byName, undefined, input);
    return item == null ? [] : [item];
  }

  const namedType = namedGraphqlType(typeRef);
  const schemaType = byName.get(namedType);
  const kind = schemaTypeKind(schemaType);
  if (kind === 'ENUM') return graphqlEnumPlaceholder(schemaType);
  if (kind !== 'INPUT_OBJECT') return placeholderForGraphqlType(formatGraphqlType(typeRef), defaultValue);
  if (input.depth <= 0 || input.path.has(namedType)) return {};

  const inputFields = (schemaType as { inputFields?: unknown })?.inputFields;
  if (!Array.isArray(inputFields)) return {};
  const nextPath = new Set([...input.path, namedType]);
  return Object.fromEntries(
    inputFields
      .map(field => field as GraphqlIntrospectionInputValue)
      .filter(field => typeof field.name === 'string' && field.name.trim().length > 0)
      .slice(0, input.maxFields)
      .map(field => [
        String(field.name),
        placeholderForGraphqlTypeRef(
          field.type,
          byName,
          typeof field.defaultValue === 'string' ? field.defaultValue : undefined,
          {
            depth: input.depth - 1,
            path: nextPath,
            maxFields: input.maxFields
          }
        )
      ])
  );
}

export function buildGraphqlOperationDraft(
  summary: GraphqlSchemaSummary,
  operation: GraphqlOperationKind,
  fieldName: string,
  options: GraphqlOperationDraftOptions = {}
): GraphqlOperationDraft {
  const fields =
    operation === 'mutation'
      ? summary.mutationFields
      : operation === 'subscription'
        ? summary.subscriptionFields
        : summary.queryFields;
  const field =
    fields.find(item => item.name === fieldName) ||
    ({
      name: fieldName,
      args: [],
      returnType: 'JSON',
      selection: [],
      selectionTree: [],
      selectionFragments: []
    } satisfies GraphqlOperationFieldSummary);
  const operationName = `${capitalizeGraphqlName(operation)}${capitalizeGraphqlName(field.name)}`;
  const variableDefinitions = field.args.map(arg => `$${arg.name}: ${arg.type}`).join(', ');
  const callArguments = field.args.map(arg => `${arg.name}: $${arg.name}`).join(', ');
  const selectedFields = options.selectedFields ? new Set(options.selectedFields) : undefined;
  const selectedFragments = options.selectedFragments ? new Set(options.selectedFragments) : undefined;
  const fragmentStyle = options.fragmentStyle || 'inline';
  const namedSelection =
    selectedFields || selectedFragments
      ? fragmentStyle === 'named'
        ? {
            ...renderGraphqlNamedSelectionNodes(field.selectionTree || [], {
              operationName,
              basePath: '',
              selectedFields,
              selectedFragments
            }),
            rootFragments: renderGraphqlNamedSelectionFragments(field.selectionFragments || [], {
              operationName,
              basePath: '',
              selectedFields,
              selectedFragments
            })
          }
        : null
      : null;
  const selectionLines =
    selectedFields || selectedFragments
      ? fragmentStyle === 'named' && namedSelection
        ? [...namedSelection.lines, ...namedSelection.rootFragments.lines]
        : [
            ...renderGraphqlSelectionNodes(field.selectionTree || [], {
              basePath: '',
              selectedFields,
              selectedFragments
            }),
            ...renderGraphqlSelectionFragments(field.selectionFragments || [], {
              basePath: '',
              selectedFields,
              selectedFragments
            })
          ]
      : field.selection;
  const fragmentDefinitions =
    fragmentStyle === 'named' && namedSelection
      ? [
          ...new Map([
            ...namedSelection.fragmentDefinitions,
            ...namedSelection.rootFragments.fragmentDefinitions
          ]).values()
        ]
      : [];
  const selection = selectionLines.length > 0
    ? ` {\n${indentGraphqlLines(selectionLines, 4)}\n  }`
    : '';
  const variables = Object.fromEntries(
    field.args.map(arg => [
      arg.name,
      arg.placeholder !== undefined ? arg.placeholder : placeholderForGraphqlType(arg.type, arg.defaultValue)
    ])
  );
  return {
    operationName,
    query: [
      `${operation} ${operationName}${variableDefinitions ? `(${variableDefinitions})` : ''} {\n  ${field.name}${callArguments ? `(${callArguments})` : ''}${selection}\n}`,
      ...fragmentDefinitions
    ].join('\n\n'),
    variables: JSON.stringify(variables, null, 2)
  };
}

export function buildGraphqlIntrospectionRequest(preview: ResolvedRequestPreview): SendRequestInput {
  const schemaUrl = preview.body.graphql?.schemaUrl?.trim();
  const targetUrl = schemaUrl || preview.url;
  const headers = ensureHeader(
    ensureHeader(preview.headers.map(row => ({ ...row })), 'Accept', 'application/json'),
    'Content-Type',
    'application/json'
  );

  return sendRequestInputSchema.parse({
    method: 'POST',
    url: targetUrl,
    headers,
    query: schemaUrl ? [] : preview.query.map(row => ({ ...row })),
    body: {
      mode: 'graphql',
      mimeType: 'application/json',
      text: JSON.stringify({ query: GRAPHQL_INTROSPECTION_QUERY }, null, 2),
      fields: [],
      graphql: {
        query: GRAPHQL_INTROSPECTION_QUERY,
        variables: '{}',
        savedOperations: []
      }
    },
    sessionId: preview.sessionId,
    timeoutMs: preview.timeoutMs,
    followRedirects: preview.followRedirects
  });
}

export function buildWorkspaceIndex(input: ScanFilesInput): WorkspaceIndex {
  const project = projectDocumentSchema.parse(parseYamlDocument<unknown>(input.projectContent));
  const environmentRecords: WorkspaceEnvironmentRecord[] = [];
  const folderRecords: WorkspaceFolderRecord[] = [];
  const requestRecords: WorkspaceRequestRecord[] = [];
  const collectionRecords: WorkspaceCollectionRecord[] = [];
  const requestsByPath = new Map<string, WorkspaceRequestRecord>();
  const sharedEnvironmentFiles = new Map<string, { filePath: string; document: EnvironmentDocument }>();
  const localEnvironmentFiles = new Map<string, { filePath: string; document: EnvironmentDocument }>();

  const filePaths = Object.keys(input.fileContents).sort((a: string, b: string) => a.localeCompare(b, 'zh-CN'));
  for (const filePath of filePaths) {
    const content = input.fileContents[filePath];
    if (
      filePath.startsWith(`${input.root}/requests`) &&
      (filePath === `${input.root}/requests/${FOLDER_CONFIG_FILE}` || filePath.endsWith(`/${FOLDER_CONFIG_FILE}`))
    ) {
      const document = parseFolderFile(filePath, content);
      const relativeSegments = pathSegmentsBetween(`${input.root}/requests`, filePath);
      const folderPath = relativeSegments.slice(0, -1).join('/');
      if (folderPath) {
        folderRecords.push({
          path: folderPath,
          filePath,
          document
        });
      }
      continue;
    }

    if (filePath.endsWith(REQUEST_SUFFIX)) {
      const request = parseRequestFile(filePath, content);
      const relativeSegments = pathSegmentsBetween(`${input.root}/requests`, filePath);
      const lastSegment = relativeSegments.at(-1) || '';
      const folderSegments = relativeSegments.slice(0, -1);
      const resourceDirPath = filePath.slice(0, -REQUEST_SUFFIX.length);
      if (request.body.file && input.fileContents[request.body.file]) {
        request.body.text = input.fileContents[request.body.file];
      }
      request.examples = request.examples.map((example: ResponseExample) =>
        example.file && input.fileContents[example.file]
          ? {
              ...example,
              text: input.fileContents[example.file]
            }
          : example
      );
      const record: WorkspaceRequestRecord = {
        request,
        cases: [],
        folderSegments,
        requestFilePath: filePath,
        resourceDirPath
      };
      requestRecords.push(record);
      requestsByPath.set(resourceDirPath, record);
      requestsByPath.set(lastSegment.replace(REQUEST_SUFFIX, ''), record);
      continue;
    }

    if (filePath.endsWith(CASE_SUFFIX)) {
      const requestDir = filePath.split('/cases/')[0];
      const record = requestsByPath.get(requestDir);
      if (!record) continue;
      record.cases.push(parseCaseFile(filePath, content));
      continue;
    }

    if (filePath.includes('/environments/') && filePath.endsWith('.yaml')) {
      const document = parseEnvironmentFile(filePath, content);
      const stem = environmentStem(filePath);
      if (filePath.endsWith(LOCAL_ENV_SUFFIX)) {
        localEnvironmentFiles.set(stem, { filePath, document });
      } else {
        sharedEnvironmentFiles.set(stem, { filePath, document });
      }
      continue;
    }

    if (filePath.includes('/collections/') && filePath.endsWith(COLLECTION_SUFFIX)) {
      const document = parseCollectionFile(filePath, content);
      const dataFilePath = document.dataFile;
      collectionRecords.push({
        document,
        filePath,
        dataFilePath,
        dataText: dataFilePath && input.fileContents[dataFilePath] ? input.fileContents[dataFilePath] : ''
      });
    }
  }

  const environmentKeys = new Set<string>([
    ...sharedEnvironmentFiles.keys(),
    ...localEnvironmentFiles.keys()
  ]);

  environmentKeys.forEach(key => {
    const sharedFile = sharedEnvironmentFiles.get(key);
    const localFile = localEnvironmentFiles.get(key);
    if (sharedFile) {
      environmentRecords.push({
        document: mergeEnvironmentDocuments(
          sharedFile.document,
          sharedFile.filePath,
          localFile?.document,
          localFile?.filePath
        ),
        filePath: sharedFile.filePath,
        localFilePath: localFile?.filePath
      });
      return;
    }

    if (localFile) {
      const standalone = environmentDocumentSchema.parse({
        ...localFile.document,
        name: localFile.document.name || key,
        vars: { ...(localFile.document.vars || {}) },
        headers: cleanRows(localFile.document.headers || []),
        authProfiles: localFile.document.authProfiles || [],
        sharedVars: {},
        sharedHeaders: [],
        localVars: { ...(localFile.document.vars || {}) },
        localHeaders: cleanRows(localFile.document.headers || []),
        sharedFilePath: undefined,
        localFilePath: localFile.filePath,
        overlayMode: 'standalone'
      });
      environmentRecords.push({
        document: standalone,
        filePath: localFile.filePath,
        localFilePath: localFile.filePath
      });
    }
  });

  const projectNode: WorkspaceTreeNode = {
    id: 'project:root',
    name: project.name,
    kind: 'project',
    children: []
  };
  const treeMap = new Map<string, Extract<WorkspaceTreeNode, { kind: 'category' }>>();
  const ensureCategoryNode = (path: string): Extract<WorkspaceTreeNode, { kind: 'category' }> | null => {
    const normalized = path.split('/').filter(Boolean).join('/');
    if (!normalized) return null;
    let currentPath = '';
    let parentChildren = projectNode.children;
    let currentNode: Extract<WorkspaceTreeNode, { kind: 'category' }> | null = null;
    normalized.split('/').forEach(segment => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let categoryNode = treeMap.get(currentPath);
      if (!categoryNode) {
        categoryNode = {
          id: `folder:${currentPath}`,
          name: segment,
          kind: 'category',
          path: currentPath,
          children: []
        };
        treeMap.set(currentPath, categoryNode);
        parentChildren.push(categoryNode);
      }
      parentChildren = categoryNode.children;
      currentNode = categoryNode;
    });
    return currentNode;
  };

  sortRecords(folderRecords).forEach(record => {
    ensureCategoryNode(record.path);
  });

  for (const record of [...requestRecords].sort((left, right) =>
    left.requestFilePath.localeCompare(right.requestFilePath, 'zh-CN')
  )) {
    const parentNode = ensureCategoryNode(record.folderSegments.join('/'));
    const parentChildren = parentNode ? parentNode.children : projectNode.children;

    parentChildren.push({
      id: `request:${record.request.id}`,
      name: record.request.name,
      kind: 'request',
      path: record.requestFilePath,
      requestId: record.request.id,
      method: record.request.method,
      requestPath: record.request.path || record.request.url || '/',
      caseCount: record.cases.length,
      children: record.cases
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
        .map(caseItem => ({
          id: `case:${record.request.id}:${caseItem.id}`,
          name: caseItem.name,
          kind: 'case',
          requestId: record.request.id,
          caseId: caseItem.id
        }))
    });
  }

  return {
    root: input.root,
    project,
    environments: sortRecords(environmentRecords.map(item => ({ ...item, name: item.document.name }))) as WorkspaceEnvironmentRecord[],
    folders: sortRecords(folderRecords),
    requests: requestRecords,
    collections: sortRecords(collectionRecords.map(item => ({ ...item, name: item.document.name }))) as WorkspaceCollectionRecord[],
    tree: [projectNode],
    gitignorePath: `${input.root}/.gitignore`,
    gitignoreContent: input.fileContents[`${input.root}/.gitignore`] || ''
  };
}

export function createProjectSeed(input: ProjectSeed) {
  const project = createDefaultProject(input.projectName);
  const sharedEnvironment = createDefaultEnvironment('shared');
  const localEnvironment = environmentDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    name: 'local',
    vars: {
      token: ''
    },
    headers: [],
    authProfiles: []
  });

  const request = requestDocumentSchema.parse({
    id: 'req_bootstrap',
    name: 'Health Check',
    method: 'GET',
    url: '{{baseUrl}}/health',
    path: '/health',
    description: 'Quick request to validate the current environment endpoint.',
    tags: ['bootstrap'],
    headers: [],
    query: [],
    pathParams: [],
    body: { mode: 'none', text: '', fields: [] },
    auth: { type: 'none' },
    examples: [],
    order: 0
  });

  const requestWrites = input.includeSampleRequest === false ? [] : materializeRequestDocuments(
    [
      {
        folderSegments: ['bootstrap'],
        request,
        cases: []
      }
    ],
    ''
  );

  const writes: WorkspaceFileWrite[] = [
    { path: 'project.yaml', content: stringifyYamlDocument(project) },
    { path: 'environments/shared.yaml', content: stringifyYamlDocument(sharedEnvironment) },
    { path: 'environments/local.local.yaml', content: stringifyYamlDocument(localEnvironment) },
    { path: '.gitignore', content: DEFAULT_GITIGNORE },
    ...requestWrites
  ];

  return { project, writes };
}

function cleanRows(rows: ParameterRow[]) {
  return rows.filter(row => row.name.trim()).map(row => ({
    ...emptyParameterRow(),
    ...row,
    name: row.name.trim(),
    value: row.value ?? ''
  }));
}

function splitUrlAndQueryRows(rawUrl: string) {
  const hashIndex = rawUrl.indexOf('#');
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1 || (hashIndex !== -1 && hashIndex < queryIndex)) {
    return {
      url: rawUrl,
      query: [] as ParameterRow[]
    };
  }

  const base = rawUrl.slice(0, queryIndex);
  const hash = hashIndex === -1 ? '' : rawUrl.slice(hashIndex);
  const search = rawUrl.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
  const query = [...new URLSearchParams(search).entries()].map(([name, value]) => ({
    ...emptyParameterRow(),
    name,
    value,
    enabled: true
  }));

  return {
    url: `${base}${hash}`,
    query
  };
}

function normalizeBody(body: RequestBody): RequestBody {
  const next = requestBodySchema.parse(body);
  if (next.mode === 'form-urlencoded' || next.mode === 'multipart') {
    return {
      ...next,
      fields: cleanRows(next.fields)
    };
  }
  return next;
}

function parseGraphqlVariables(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (_error) {
    return trimmed;
  }
}

function hasInvalidGraphqlVariables(body: RequestBody) {
  if (body.mode !== 'graphql') return false;
  const variables = body.graphql?.variables || '';
  if (!variables.trim()) return false;
  try {
    JSON.parse(variables);
    return false;
  } catch (_error) {
    return true;
  }
}

function materializeGraphqlBody(body: RequestBody): RequestBody {
  if (body.mode !== 'graphql' || !body.graphql) return body;
  const payload: Record<string, unknown> = {
    query: body.graphql.query
  };
  const variables = parseGraphqlVariables(body.graphql.variables || '');
  if (variables !== undefined) {
    payload.variables = variables;
  }
  if (body.graphql.operationName?.trim()) {
    payload.operationName = body.graphql.operationName.trim();
  }
  return {
    ...body,
    mimeType: body.mimeType || 'application/json',
    text: JSON.stringify(payload, null, 2)
  };
}

function resolveSidecarPath(basePath: string, kind: 'body' | 'example', name: string, mimeType?: string) {
  const ext = mimeType?.includes('json') ? 'json' : mimeType?.includes('html') ? 'html' : 'txt';
  if (kind === 'body') {
    return `${basePath}/bodies/${slugify(name || 'body')}.${ext}`;
  }
  return `${basePath}/examples/${slugify(name || 'response')}.${ext}`;
}

function serializeRequestDocument(record: {
  folderSegments: string[];
  request: RequestDocument;
  cases: CaseDocument[];
}): WorkspaceFileWrite[] {
  const request = requestDocumentSchema.parse({
    ...record.request,
    headers: cleanRows(record.request.headers),
    query: cleanRows(record.request.query),
    pathParams: cleanRows(record.request.pathParams),
    body: normalizeBody(record.request.body)
  });
  const requestSlug = slugify(request.name);
  const relativeBase = ['requests', ...record.folderSegments, requestSlug].join('/');
  const requestFilePath = `${relativeBase}${REQUEST_SUFFIX}`;
  const resourceDirPath = relativeBase;

  const mainFile: Record<string, unknown> = {
    ...request,
        examples: request.examples.map((example: ResponseExample) => {
      if (example.text.length > BODY_SIDECAR_THRESHOLD) {
        const file = resolveSidecarPath(resourceDirPath, 'example', example.name, example.mimeType);
        return {
          ...example,
          text: '',
          file
        };
      }
      return example;
    })
  };

  const writes: WorkspaceFileWrite[] = [{ path: requestFilePath, content: stringifyYamlDocument(mainFile) }];

  if (request.body.text.length > BODY_SIDECAR_THRESHOLD && request.body.mode !== 'none') {
    const bodyPath = resolveSidecarPath(resourceDirPath, 'body', request.name, request.body.mimeType);
    mainFile.body = {
      ...request.body,
      text: '',
      file: bodyPath
    };
    writes[0] = { path: requestFilePath, content: stringifyYamlDocument(mainFile) };
    writes.push({ path: bodyPath, content: request.body.text });
  }

  request.examples.forEach((example: ResponseExample) => {
    if (example.text.length > BODY_SIDECAR_THRESHOLD) {
      const file = resolveSidecarPath(resourceDirPath, 'example', example.name, example.mimeType);
      writes.push({ path: file, content: example.text });
    }
  });

  record.cases.forEach(caseItem => {
    const caseSlug = slugify(caseItem.name);
    writes.push({
      path: `${resourceDirPath}/cases/${caseSlug}${CASE_SUFFIX}`,
      content: stringifyYamlDocument(caseDocumentSchema.parse(caseItem))
    });
  });

  return writes;
}

function folderConfigPath(rootPath: string, folderPath: string) {
  const normalized = folderPath.split('/').filter(Boolean).join('/');
  return `${rootPath ? `${rootPath}/` : ''}requests/${normalized ? `${normalized}/` : ''}${FOLDER_CONFIG_FILE}`;
}

export function materializeFolderDocument(
  folderPath: string,
  variableRows: ParameterRow[],
  rootPath: string
): WorkspaceFileWrite {
  const cleanVariableRows = cleanRows(variableRows).filter(row => row.name.trim());
  return {
    path: folderConfigPath(rootPath, folderPath),
    content: stringifyYamlDocument(folderDocumentSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      variableRows: cleanVariableRows
    }))
  };
}

function folderVariableValues(rows: ParameterRow[]) {
  const entries = cleanRows(rows)
    .filter(row => row.enabled !== false && row.name.trim())
    .map(row => [row.name.trim(), row.kind === 'file' ? row.filePath || row.value || '' : row.value] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : {};
}

function workspaceFolderVariableMap(workspace: WorkspaceIndex, folderSegments: string[]) {
  const normalizedSegments = folderSegments.filter(Boolean);
  const values: Record<string, unknown> = {};
  for (let index = 1; index <= normalizedSegments.length; index += 1) {
    const path = normalizedSegments.slice(0, index).join('/');
    const record = workspace.folders.find(item => item.path === path);
    if (!record) continue;
    Object.assign(values, folderVariableValues(record.document.variableRows || []));
  }
  return values;
}

export function workspaceFolderVariableSources(workspace: WorkspaceIndex, folderSegments: string[]) {
  const normalizedSegments = folderSegments.filter(Boolean);
  const sources: Array<Record<string, unknown>> = [];
  for (let index = normalizedSegments.length; index > 0; index -= 1) {
    const path = normalizedSegments.slice(0, index).join('/');
    const record = workspace.folders.find(item => item.path === path);
    if (!record) continue;
    const values = folderVariableValues(record.document.variableRows || []);
    if (Object.keys(values).length === 0) continue;
    sources.push(createNamedTemplateSource(`folder variables · ${path}`, values, 'runtime'));
  }
  return sources;
}

function bruScalar(value: unknown) {
  return String(value ?? '').replace(/\r?\n/g, '\\n');
}

function bruDictionaryBlock(label: string, entries: Array<[string, unknown]>) {
  const lines = entries.map(([key, value]) => `  ${key}: ${bruScalar(value)}`);
  return `${label} {\n${lines.join('\n')}\n}`;
}

function bruTextBlock(label: string, text: string) {
  return `${label} {\n${text.replace(/\r\n/g, '\n')}\n}`;
}

function bruRowsBlock(label: string, rows: ParameterRow[]) {
  const lines = cleanRows(rows).map(row => {
    const prefix = row.enabled === false ? '~' : '';
    const value = row.kind === 'file' ? `@file(${row.filePath || row.value || ''})` : row.value;
    return `  ${prefix}${row.name}: ${bruScalar(value)}`;
  });
  if (lines.length === 0) return '';
  return `${label} {\n${lines.join('\n')}\n}`;
}

function bruBodyMode(body: RequestBody) {
  switch (body.mode) {
    case 'form-urlencoded':
      return 'formUrlEncoded';
    case 'multipart':
      return 'multipartForm';
    default:
      return body.mode;
  }
}

function bruBodyBlocks(body: RequestBody) {
  const normalized = normalizeBody(body);
  if (normalized.mode === 'none') return [];
  if (normalized.mode === 'form-urlencoded') {
    const block = bruRowsBlock('body:form-urlencoded', normalized.fields);
    return block ? [block] : [];
  }
  if (normalized.mode === 'multipart') {
    const block = bruRowsBlock('body:multipart-form', normalized.fields);
    return block ? [block] : [];
  }
  if (normalized.mode === 'file') {
    return [
      bruRowsBlock('body:file', [{
        ...emptyParameterRow(),
        name: 'file',
        value: normalized.file || normalized.text || '',
        filePath: normalized.file || normalized.text || '',
        kind: 'file'
      }])
    ].filter(Boolean);
  }
  if (normalized.mode === 'graphql') {
    return [
      bruTextBlock('body:graphql', normalized.graphql?.query || normalized.text),
      normalized.graphql?.variables?.trim()
        ? bruTextBlock('body:graphql:vars', normalized.graphql.variables)
        : ''
    ].filter(Boolean);
  }
  return [bruTextBlock(`body:${normalized.mode}`, normalized.text)];
}

function bruAuthMode(auth: AuthConfig) {
  if (auth.type === 'profile') return 'inherit';
  return auth.type || 'inherit';
}

function bruAuthBlock(auth: AuthConfig) {
  switch (auth.type) {
    case 'bearer':
      return bruDictionaryBlock('auth:bearer', [['token', auth.token || auth.tokenFromVar ? auth.token || `{{${auth.tokenFromVar}}}` : '']]);
    case 'basic':
      return bruDictionaryBlock('auth:basic', [
        ['username', auth.username || auth.usernameFromVar ? auth.username || `{{${auth.usernameFromVar}}}` : ''],
        ['password', auth.password || auth.passwordFromVar ? auth.password || `{{${auth.passwordFromVar}}}` : '']
      ]);
    case 'apikey':
      return bruDictionaryBlock('auth:apikey', [
        ['key', auth.key || 'X-API-Key'],
        ['value', auth.value || auth.valueFromVar ? auth.value || `{{${auth.valueFromVar}}}` : ''],
        ['placement', auth.addTo || 'header']
      ]);
    case 'oauth2':
      return bruDictionaryBlock('auth:oauth2', [
        ['grant_type', auth.grantType || auth.oauthFlow || 'client_credentials'],
        ['access_token_url', auth.tokenUrl || ''],
        ['client_id', auth.clientId || auth.clientIdFromVar ? auth.clientId || `{{${auth.clientIdFromVar}}}` : ''],
        ['client_secret', auth.clientSecret || auth.clientSecretFromVar ? auth.clientSecret || `{{${auth.clientSecretFromVar}}}` : ''],
        ['scope', auth.scope || ''],
        ['token_placement', auth.tokenPlacement || 'header'],
        ['token_header_prefix', auth.tokenPrefix || 'Bearer']
      ]);
    case 'oauth1':
      return bruDictionaryBlock('auth:oauth1', [
        ['consumer_key', auth.consumerKey || ''],
        ['consumer_secret', auth.consumerSecret || ''],
        ['access_token', auth.accessToken || auth.token || ''],
        ['token_secret', auth.secretKey || ''],
        ['signature_method', auth.signatureMethod || 'HMAC-SHA1'],
        ['nonce', auth.nonce || ''],
        ['version', auth.version || '1.0'],
        ['realm', auth.realm || '']
      ]);
    case 'awsv4':
      return bruDictionaryBlock('auth:awsv4', [
        ['accessKeyId', auth.accessKey || ''],
        ['secretAccessKey', auth.secretKey || ''],
        ['sessionToken', auth.sessionToken || ''],
        ['service', auth.service || ''],
        ['region', auth.region || '']
      ]);
    case 'digest':
      return bruDictionaryBlock('auth:digest', [
        ['username', auth.username || ''],
        ['password', auth.password || ''],
        ['realm', auth.realm || ''],
        ['nonce', auth.nonce || ''],
        ['qop', auth.qop || 'auth'],
        ['algorithm', auth.algorithm || 'MD5']
      ]);
    case 'ntlm':
      return bruDictionaryBlock('auth:ntlm', [
        ['username', auth.username || ''],
        ['password', auth.password || ''],
        ['domain', auth.domain || ''],
        ['workstation', auth.workstation || '']
      ]);
    case 'wsse':
      return bruDictionaryBlock('auth:wsse', [
        ['username', auth.username || ''],
        ['password', auth.password || '']
      ]);
    case 'profile':
      return auth.profileName ? bruDictionaryBlock('auth:profile', [['name', auth.profileName]]) : '';
    default:
      return '';
  }
}

export function serializeRequestToBruno(input: RequestDocument) {
  const request = requestDocumentSchema.parse({
    ...input,
    headers: cleanRows(input.headers),
    query: cleanRows(input.query),
    pathParams: cleanRows(input.pathParams),
    body: normalizeBody(input.body)
  });
  const blocks = [
    bruDictionaryBlock('meta', [
      ['name', request.name],
      ['type', request.kind === 'graphql' ? 'graphql' : request.kind === 'websocket' ? 'websocket' : 'http'],
      ['seq', request.order || 1]
    ]),
    bruDictionaryBlock(request.method.toLowerCase(), [
      ['url', request.url],
      ['body', bruBodyMode(request.body)],
      ['auth', bruAuthMode(request.auth)]
    ]),
    bruRowsBlock('headers', request.headers),
    bruRowsBlock('params:query', request.query),
    bruRowsBlock('params:path', request.pathParams),
    ...bruBodyBlocks(request.body),
    bruAuthBlock(request.auth),
    request.scripts.preRequest.trim() ? bruTextBlock('script:pre-request', request.scripts.preRequest.trim()) : '',
    request.scripts.postResponse.trim() ? bruTextBlock('script:post-response', request.scripts.postResponse.trim()) : '',
    request.scripts.tests.trim() ? bruTextBlock('tests', request.scripts.tests.trim()) : '',
    request.docs.trim() ? bruTextBlock('docs', request.docs.trim()) : ''
  ].filter(Boolean);

  return `${blocks.join('\n\n')}\n`;
}

function brunoJsonDocument(name: string) {
  return JSON.stringify({
    version: '1',
    name,
    type: 'collection'
  }, null, 2) + '\n';
}

function brunoEnvironmentDocument(environment: EnvironmentDocument) {
  const vars = Object.entries(environment.vars || {}).map(([name, value]) => ({
    ...emptyParameterRow(),
    name,
    value,
    enabled: true
  }));
  return `${bruRowsBlock('vars', vars) || 'vars {\n}'}\n`;
}

function brunoCollectionBru(collection: CollectionDocument | undefined, project: ProjectDocument) {
  if (!collection) {
    return bruTextBlock('docs', `${project.name} exported from YAPI Debugger.`) + '\n';
  }

  const variableRows = [
    ...Object.entries(collection.vars || {}).map(([name, value]) => ({
      ...emptyParameterRow(),
      name,
      value,
      enabled: true
    })),
    ...collection.variableRows
      .filter(row => row.scope === 'collection' || row.scope === 'request')
      .map(row => ({
        ...emptyParameterRow(),
        ...row
      }))
  ];
  const blocks = [
    bruRowsBlock('headers', collection.headers),
    bruDictionaryBlock('auth', [['mode', bruAuthMode(collection.auth)]]),
    bruAuthBlock(collection.auth),
    bruRowsBlock('vars:pre-request', variableRows),
    collection.scripts.preRequest.trim() ? bruTextBlock('script:pre-request', collection.scripts.preRequest.trim()) : '',
    collection.scripts.postResponse.trim() ? bruTextBlock('script:post-response', collection.scripts.postResponse.trim()) : '',
    collection.scripts.tests.trim() ? bruTextBlock('tests', collection.scripts.tests.trim()) : '',
    collection.docs.trim() ? bruTextBlock('docs', collection.docs.trim()) : bruTextBlock('docs', `${collection.name} exported from YAPI Debugger.`)
  ].filter(Boolean);

  return `${blocks.join('\n\n')}\n`;
}

function brunoFolderBru(name: string, seq: number) {
  return `${bruDictionaryBlock('meta', [
    ['name', name],
    ['seq', seq]
  ])}\n`;
}

function orderedBrunoRequestRecords(
  requests: WorkspaceRequestRecord[],
  collection?: CollectionDocument
) {
  if (!collection) {
    return requests
      .slice()
      .sort((left, right) => {
        const orderDiff = (left.request.order || 0) - (right.request.order || 0);
        return orderDiff || left.requestFilePath.localeCompare(right.requestFilePath, 'zh-CN');
      })
      .map((record, index) => ({ record, seq: index + 1 }));
  }

  const byId = new Map(requests.map(record => [record.request.id, record]));
  const orderedSteps = [
    ...collection.setupSteps,
    ...collection.steps,
    ...collection.teardownSteps
  ].filter(step => step.enabled !== false);
  const seen = new Set<string>();
  return orderedSteps
    .map(step => byId.get(step.requestId))
    .filter((record): record is WorkspaceRequestRecord => Boolean(record))
    .filter(record => {
      if (seen.has(record.request.id)) return false;
      seen.add(record.request.id);
      return true;
    })
    .map((record, index) => ({ record, seq: index + 1 }));
}

function uniqueBrunoPath(used: Set<string>, folderSegments: string[], requestName: string) {
  const folder = folderSegments.map(segment => slugify(segment)).filter(Boolean);
  const base = slugify(requestName || 'request') || 'request';
  let candidate = [...folder, `${base}.bru`].join('/');
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = [...folder, `${base}-${suffix}.bru`].join('/');
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function brunoJsonRow(row: ParameterRow, type?: 'query' | 'path') {
  return {
    name: row.name,
    value: row.kind === 'file' ? row.filePath || row.value : row.value,
    description: row.description || '',
    enabled: row.enabled !== false,
    ...(type ? { type } : {}),
    ...(row.kind === 'file' ? { type: 'file' } : {})
  };
}

function tokenFromVar(name: string | undefined) {
  return name ? `{{${name}}}` : '';
}

function brunoJsonAuth(auth: AuthConfig) {
  switch (auth.type) {
    case 'none':
      return { mode: 'none' };
    case 'bearer':
      return { mode: 'bearer', bearer: { token: auth.token || tokenFromVar(auth.tokenFromVar) } };
    case 'basic':
      return {
        mode: 'basic',
        basic: {
          username: auth.username || tokenFromVar(auth.usernameFromVar),
          password: auth.password || tokenFromVar(auth.passwordFromVar)
        }
      };
    case 'apikey':
      return {
        mode: 'apikey',
        apikey: {
          key: auth.key || 'X-API-Key',
          value: auth.value || tokenFromVar(auth.valueFromVar),
          placement: auth.addTo || 'header'
        }
      };
    case 'oauth1':
      return {
        mode: 'oauth1',
        oauth1: {
          consumerKey: auth.consumerKey || '',
          consumerSecret: auth.consumerSecret || '',
          accessToken: auth.accessToken || auth.token || '',
          accessTokenSecret: auth.secretKey || '',
          signatureMethod: auth.signatureMethod || 'HMAC-SHA1',
          version: auth.version || '1.0',
          realm: auth.realm || ''
        }
      };
    case 'oauth2':
      return {
        mode: 'oauth2',
        oauth2: {
          grantType: auth.grantType || auth.oauthFlow || 'client_credentials',
          tokenUrl: auth.tokenUrl || '',
          clientId: auth.clientId || tokenFromVar(auth.clientIdFromVar),
          clientSecret: auth.clientSecret || tokenFromVar(auth.clientSecretFromVar),
          scope: auth.scope || ''
        }
      };
    case 'digest':
      return {
        mode: 'digest',
        digest: {
          username: auth.username || '',
          password: auth.password || ''
        }
      };
    default:
      return { mode: auth.type === 'inherit' ? 'inherit' : 'none' };
  }
}

function brunoJsonBody(body: RequestBody, kind: RequestKind) {
  const normalized = normalizeBody(body);
  if (kind === 'websocket') {
    return {
      mode: 'ws',
      ws: (normalized.websocket?.messages || []).map((message, index) => ({
        name: message.name || `message ${index + 1}`,
        type: message.kind || 'json',
        content: message.body || '',
        enabled: message.enabled !== false
      }))
    };
  }
  if (kind === 'grpc') {
    return {
      mode: 'grpc',
      grpc: [{
        name: 'message 1',
        content: normalized.grpc?.message || '',
        ...(normalized.grpc?.rpcKind && normalized.grpc.rpcKind !== 'unary' ? { rpcKind: normalized.grpc.rpcKind } : {})
      }]
    };
  }
  switch (normalized.mode) {
    case 'json':
      return { mode: 'json', json: normalized.text || '' };
    case 'text':
      return { mode: 'text', text: normalized.text || '' };
    case 'xml':
      return { mode: 'xml', xml: normalized.text || '' };
    case 'sparql':
      return { mode: 'sparql', sparql: normalized.text || '' };
    case 'graphql':
      return {
        mode: 'graphql',
        graphql: {
          query: normalized.graphql?.query || normalized.text || '',
          variables: normalized.graphql?.variables || '{}',
          operationName: normalized.graphql?.operationName || undefined,
          schemaUrl: normalized.graphql?.schemaUrl || undefined,
          savedOperations: (normalized.graphql?.savedOperations || []).map(operation => ({
            name: operation.name,
            query: operation.query,
            variables: parseJsonOrString(operation.variables || '{}'),
            ...(operation.operationName ? { operationName: operation.operationName } : {}),
            ...(operation.updatedAt ? { updatedAt: operation.updatedAt } : {})
          })),
          schemaCache: normalized.graphql?.schemaCache || undefined
        }
      };
    case 'form-urlencoded':
      return {
        mode: 'formUrlEncoded',
        formUrlEncoded: cleanRows(normalized.fields).map(row => brunoJsonRow(row))
      };
    case 'multipart':
      return {
        mode: 'multipartForm',
        multipartForm: cleanRows(normalized.fields).map(row => brunoJsonRow(row))
      };
    case 'file':
      return {
        mode: 'file',
        file: [{
          filePath: normalized.file || normalized.text || '',
          contentType: normalized.mimeType || 'application/octet-stream',
          selected: true
        }]
      };
    default:
      return { mode: 'none' };
  }
}

function brunoJsonRequestType(kind: RequestKind) {
  if (kind === 'graphql') return 'graphql-request';
  if (kind === 'websocket') return 'ws-request';
  if (kind === 'grpc') return 'grpc-request';
  if (kind === 'script') return 'js';
  return 'http-request';
}

function brunoJsonMethod(request: RequestDocument) {
  if (request.kind === 'grpc') {
    const service = request.body.grpc?.service || '';
    const method = request.body.grpc?.method || '';
    return service && method ? `${service}/${method}` : method || request.method;
  }
  return request.method;
}

function brunoJsonItem(record: WorkspaceRequestRecord, seq: number) {
  const request = requestDocumentSchema.parse({
    ...record.request,
    order: seq,
    headers: cleanRows(record.request.headers),
    query: cleanRows(record.request.query),
    pathParams: cleanRows(record.request.pathParams),
    body: normalizeBody(record.request.body)
  });
  if (request.kind === 'script') {
    return {
      uid: request.id,
      type: 'js',
      name: request.name,
      fileContent: request.body.text || request.scripts.preRequest || ''
    };
  }
  return {
    uid: request.id,
    name: request.name,
    type: brunoJsonRequestType(request.kind),
    seq,
    tags: request.tags,
    request: {
      url: request.url,
      method: brunoJsonMethod(request),
      headers: request.headers.map(row => brunoJsonRow(row)),
      params: [
        ...request.query.map(row => brunoJsonRow(row, 'query')),
        ...request.pathParams.map(row => brunoJsonRow(row, 'path'))
      ],
      body: brunoJsonBody(request.body, request.kind),
      auth: brunoJsonAuth(request.auth),
      script: {
        req: request.scripts.preRequest || null,
        res: request.scripts.postResponse || null
      },
      tests: request.scripts.tests || null,
      docs: request.docs || '',
      ...(request.kind === 'grpc' && request.body.grpc?.protoFile ? { protoPath: request.body.grpc.protoFile } : {}),
      ...(request.kind === 'grpc' && request.body.grpc?.importPaths?.length
        ? { importPaths: request.body.grpc.importPaths.filter(Boolean) }
        : {})
    }
  };
}

export function serializeBrunoJsonCollection(input: {
  project: ProjectDocument;
  requests: WorkspaceRequestRecord[];
  collection?: CollectionDocument;
}) {
  const collection = input.collection ? collectionDocumentSchema.parse(input.collection) : undefined;
  const project = projectDocumentSchema.parse(input.project);
  const name = collection?.name || project.name;
  const ordered = orderedBrunoRequestRecords(input.requests, collection);
  const rootItems: any[] = [];
  const folders = new Map<string, any>();

  function folderItems(folderSegments: string[]) {
    let items = rootItems;
    let currentPath = '';
    folderSegments.forEach(segment => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folder = folders.get(currentPath);
      if (!folder) {
        folder = {
          uid: slugify(currentPath) || `folder-${folders.size + 1}`,
          name: segment,
          type: 'folder',
          items: []
        };
        folders.set(currentPath, folder);
        items.push(folder);
      }
      items = folder.items;
    });
    return items;
  }

  ordered.forEach(({ record, seq }) => {
    folderItems(record.folderSegments).push(brunoJsonItem(record, seq));
  });

  return JSON.stringify({
    uid: slugify(name) || 'collection',
    version: '1',
    name,
    items: rootItems
  }, null, 2) + '\n';
}

function openCollectionDescription(text: string) {
  return text.trim() ? { content: text.trim(), type: 'text/markdown' } : undefined;
}

function openCollectionRow(row: ParameterRow, type?: 'query' | 'path') {
  return {
    name: row.name,
    value: row.kind === 'file' ? row.filePath || row.value : row.value,
    ...(type ? { type } : {}),
    ...(row.enabled === false ? { disabled: true } : {}),
    ...(row.description?.trim() ? { description: row.description.trim() } : {}),
    ...(row.kind === 'file' ? { type: 'file' } : {})
  };
}

function openCollectionAuth(auth: AuthConfig): unknown {
  switch (auth.type) {
    case 'inherit':
      return 'inherit';
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: auth.token || tokenFromVar(auth.tokenFromVar) };
    case 'basic':
      return {
        type: 'basic',
        username: auth.username || tokenFromVar(auth.usernameFromVar),
        password: auth.password || tokenFromVar(auth.passwordFromVar)
      };
    case 'apikey':
      return {
        type: 'apikey',
        key: auth.key || 'X-API-Key',
        value: auth.value || tokenFromVar(auth.valueFromVar),
        placement: auth.addTo || 'header'
      };
    case 'oauth1':
      return {
        type: 'oauth1',
        consumerKey: auth.consumerKey || '',
        consumerSecret: auth.consumerSecret || '',
        accessToken: auth.accessToken || auth.token || '',
        accessTokenSecret: auth.secretKey || '',
        signatureMethod: auth.signatureMethod || 'HMAC-SHA1',
        version: auth.version || '1.0',
        realm: auth.realm || ''
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        grantType: auth.grantType || auth.oauthFlow || 'client_credentials',
        tokenUrl: auth.tokenUrl || '',
        clientId: auth.clientId || tokenFromVar(auth.clientIdFromVar),
        clientSecret: auth.clientSecret || tokenFromVar(auth.clientSecretFromVar),
        scope: auth.scope || ''
      };
    case 'awsv4':
      return {
        type: 'awsv4',
        accessKeyId: auth.accessKey || '',
        secretAccessKey: auth.secretKey || '',
        sessionToken: auth.sessionToken || '',
        service: auth.service || '',
        region: auth.region || ''
      };
    case 'digest':
      return { type: 'digest', username: auth.username || '', password: auth.password || '' };
    case 'ntlm':
      return {
        type: 'ntlm',
        username: auth.username || '',
        password: auth.password || '',
        domain: auth.domain || '',
        workstation: auth.workstation || ''
      };
    case 'wsse':
      return { type: 'wsse', username: auth.username || '', password: auth.password || '' };
    default:
      return 'inherit';
  }
}

function openCollectionBody(body: RequestBody, kind: RequestKind): unknown {
  const normalized = normalizeBody(body);
  if (kind === 'graphql') {
    return {
      query: normalized.graphql?.query || normalized.text || '',
      variables: parseJsonOrString(normalized.graphql?.variables || '{}'),
      ...(normalized.graphql?.operationName ? { operationName: normalized.graphql.operationName } : {}),
      ...(normalized.graphql?.schemaUrl ? { schemaUrl: normalized.graphql.schemaUrl } : {}),
      ...(normalized.graphql?.savedOperations?.length
        ? {
            savedOperations: normalized.graphql.savedOperations.map(operation => ({
              name: operation.name,
              query: operation.query,
              variables: parseJsonOrString(operation.variables || '{}'),
              ...(operation.operationName ? { operationName: operation.operationName } : {}),
              ...(operation.updatedAt ? { updatedAt: operation.updatedAt } : {})
            }))
          }
        : {}),
      ...(normalized.graphql?.schemaCache ? { schemaCache: normalized.graphql.schemaCache } : {})
    };
  }
  switch (normalized.mode) {
    case 'json':
    case 'text':
    case 'xml':
    case 'sparql':
      return {
        type: normalized.mode,
        data: normalized.mode === 'json' ? parseJsonOrString(normalized.text || '') : normalized.text || ''
      };
    case 'form-urlencoded':
      return {
        type: 'form-urlencoded',
        data: cleanRows(normalized.fields).map(row => openCollectionRow(row))
      };
    case 'multipart':
      return {
        type: 'multipart-form',
        data: cleanRows(normalized.fields).map(row => openCollectionRow(row))
      };
    case 'file':
      return {
        type: 'file',
        data: [{
          type: 'file',
          filePath: normalized.file || normalized.text || '',
          contentType: normalized.mimeType || 'application/octet-stream',
          selected: true
        }]
      };
    default:
      return undefined;
  }
}

function parseJsonOrString(text: string) {
  if (!text.trim()) return '';
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function openCollectionScripts(request: RequestDocument) {
  const scripts = [
    request.scripts.preRequest.trim() ? { type: 'before-request', code: request.scripts.preRequest.trim() } : null,
    request.scripts.postResponse.trim() ? { type: 'after-response', code: request.scripts.postResponse.trim() } : null,
    request.scripts.tests.trim() ? { type: 'tests', code: request.scripts.tests.trim() } : null
  ].filter(Boolean);
  return scripts.length > 0 ? scripts : undefined;
}

function openCollectionVariables(request: RequestDocument) {
  const variables = request.vars.req
    .filter(row => row.name)
    .map(row => ({
      name: row.name,
      value: row.value,
      ...(row.scope && row.scope !== 'request' ? { scope: row.scope } : {}),
      ...(row.enabled === false ? { disabled: true } : {}),
      ...(row.secret ? { secret: true } : {}),
      ...(row.description?.trim() ? { description: row.description.trim() } : {})
    }));
  return variables.length > 0 ? variables : undefined;
}

function openCollectionItem(record: WorkspaceRequestRecord, seq: number) {
  const request = requestDocumentSchema.parse({
    ...record.request,
    order: seq,
    headers: cleanRows(record.request.headers),
    query: cleanRows(record.request.query),
    pathParams: cleanRows(record.request.pathParams),
    body: normalizeBody(record.request.body)
  });
  const info = {
    name: request.name,
    type: request.kind === 'websocket' ? 'websocket' : request.kind,
    seq,
    ...(request.tags.length > 0 ? { tags: request.tags } : {})
  };
  const docs = openCollectionDescription(request.docs || request.description || '');
  const runtime = {
    ...(openCollectionScripts(request) ? { scripts: openCollectionScripts(request) } : {}),
    ...(openCollectionVariables(request) ? { variables: openCollectionVariables(request) } : {})
  };
  const base = {
    info,
    ...(Object.keys(runtime).length > 0 ? { runtime } : {}),
    ...(docs ? { docs } : {})
  };

  if (request.kind === 'script') {
    return {
      ...base,
      script: request.body.text || request.scripts.preRequest || ''
    };
  }
  if (request.kind === 'graphql') {
    return {
      ...base,
      graphql: {
        method: request.method,
        url: request.url,
        ...(request.headers.length > 0 ? { headers: request.headers.map(row => openCollectionRow(row)) } : {}),
        ...((request.query.length > 0 || request.pathParams.length > 0) ? {
          params: [
            ...request.query.map(row => openCollectionRow(row, 'query')),
            ...request.pathParams.map(row => openCollectionRow(row, 'path'))
          ]
        } : {}),
        body: openCollectionBody(request.body, request.kind),
        auth: openCollectionAuth(request.auth)
      }
    };
  }
  if (request.kind === 'websocket') {
    return {
      ...base,
      websocket: {
        url: request.url,
        ...(request.headers.length > 0 ? { headers: request.headers.map(row => openCollectionRow(row)) } : {}),
        message: (request.body.websocket?.messages || []).map((message, index) => ({
          title: message.name || `message ${index + 1}`,
          selected: message.enabled !== false,
          message: {
            type: message.kind || 'json',
            data: message.body || ''
          }
        })),
        auth: openCollectionAuth(request.auth)
      }
    };
  }
  if (request.kind === 'grpc') {
    const service = request.body.grpc?.service || '';
    const method = request.body.grpc?.method || '';
    return {
      ...base,
      grpc: {
        url: request.url,
        method: service && method ? `${service}/${method}` : method,
        ...(request.body.grpc?.protoFile ? { protoFilePath: request.body.grpc.protoFile } : {}),
        ...(request.body.grpc?.importPaths?.length ? { importPaths: request.body.grpc.importPaths.filter(Boolean) } : {}),
        ...(request.body.grpc?.rpcKind && request.body.grpc.rpcKind !== 'unary' ? { rpcKind: request.body.grpc.rpcKind } : {}),
        ...(request.headers.length > 0 ? { metadata: request.headers.map(row => openCollectionRow(row)) } : {}),
        message: request.body.grpc?.message || '',
        auth: openCollectionAuth(request.auth)
      }
    };
  }
  return {
    ...base,
    http: {
      method: request.method,
      url: request.url,
      ...(request.headers.length > 0 ? { headers: request.headers.map(row => openCollectionRow(row)) } : {}),
      ...((request.query.length > 0 || request.pathParams.length > 0) ? {
        params: [
          ...request.query.map(row => openCollectionRow(row, 'query')),
          ...request.pathParams.map(row => openCollectionRow(row, 'path'))
        ]
      } : {}),
      ...(openCollectionBody(request.body, request.kind) ? { body: openCollectionBody(request.body, request.kind) } : {}),
      auth: openCollectionAuth(request.auth)
    },
    ...(request.examples.length > 0 ? {
      examples: request.examples.slice(0, 3).map(example => ({
        name: example.name,
        response: {
          status: example.status || 200,
          body: {
            type: example.mimeType?.includes('json') || example.contentType === 'json' ? 'json' : 'text',
            data: example.text
          }
        }
      }))
    } : {})
  };
}

export function serializeOpenCollection(input: {
  project: ProjectDocument;
  requests: WorkspaceRequestRecord[];
  environments?: EnvironmentDocument[];
  collection?: CollectionDocument;
}) {
  const collection = input.collection ? collectionDocumentSchema.parse(input.collection) : undefined;
  const project = projectDocumentSchema.parse(input.project);
  const name = collection?.name || project.name;
  const ordered = orderedBrunoRequestRecords(input.requests, collection);
  const rootItems: any[] = [];
  const folders = new Map<string, any>();

  function folderItems(folderSegments: string[]) {
    let items = rootItems;
    let currentPath = '';
    folderSegments.forEach(segment => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folder = folders.get(currentPath);
      if (!folder) {
        folder = {
          info: {
            name: segment,
            type: 'folder'
          },
          items: []
        };
        folders.set(currentPath, folder);
        items.push(folder);
      }
      items = folder.items;
    });
    return items;
  }

  ordered.forEach(({ record, seq }) => {
    folderItems(record.folderSegments).push(openCollectionItem(record, seq));
  });

  const environments = (input.environments || []).map(environment => environmentDocumentSchema.parse(environment));
  const document = {
    opencollection: '1.0.0',
    info: { name },
    ...(rootItems.length > 0 ? { items: rootItems } : {}),
    ...(environments.length > 0 ? {
      config: {
        environments: environments.map(environment => ({
          name: environment.name,
          variables: Object.entries(environment.vars || {}).map(([variableName, value]) => ({
            name: variableName,
            value
          }))
        }))
      }
    } : {}),
    bundled: true
  };

  return JSON.stringify(document, null, 2) + '\n';
}

export function materializeBrunoCollectionExport(input: {
  project: ProjectDocument;
  requests: WorkspaceRequestRecord[];
  environments?: EnvironmentDocument[];
  collection?: CollectionDocument;
}) {
  const collection = input.collection ? collectionDocumentSchema.parse(input.collection) : undefined;
  const project = projectDocumentSchema.parse(input.project);
  const name = collection?.name || project.name;
  const ordered = orderedBrunoRequestRecords(input.requests, collection);
  const writes: WorkspaceFileWrite[] = [
    { path: 'bruno.json', content: brunoJsonDocument(name) },
    { path: 'collection.bru', content: brunoCollectionBru(collection, project) }
  ];
  const folders = new Map<string, { name: string; seq: number }>();
  const usedPaths = new Set(writes.map(write => write.path));

  (input.environments || []).forEach(environment => {
    const parsed = environmentDocumentSchema.parse(environment);
    const path = `environments/${slugify(parsed.name) || 'environment'}.bru`;
    usedPaths.add(path);
    writes.push({
      path,
      content: brunoEnvironmentDocument(parsed)
    });
  });

  ordered.forEach(({ record }) => {
    let currentPath = '';
    record.folderSegments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${slugify(segment)}` : slugify(segment);
      if (!folders.has(currentPath)) {
        folders.set(currentPath, { name: segment, seq: folders.size + index + 1 });
      }
    });
  });

  [...folders.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
    .forEach(([folderPath, folder]) => {
      const path = `${folderPath}/folder.bru`;
      usedPaths.add(path);
      writes.push({
        path,
        content: brunoFolderBru(folder.name, folder.seq)
      });
    });

  ordered.forEach(({ record, seq }) => {
    const request = requestDocumentSchema.parse({
      ...record.request,
      order: seq
    });
    writes.push({
      path: uniqueBrunoPath(usedPaths, record.folderSegments, request.name),
      content: serializeRequestToBruno(request)
    });
  });

  return writes;
}

export function materializeRequestDocuments(
  records: Array<{
    folderSegments: string[];
    request: RequestDocument;
    cases: CaseDocument[];
  }>,
  rootPath: string
) {
  return records.flatMap(record =>
    serializeRequestDocument(record).map(item => ({
      path: rootPath ? `${rootPath}/${item.path}` : item.path,
      content: item.content
    }))
  );
}

function collectionDataFilePath(collection: CollectionDocument) {
  return collection.dataFile || `collections/${slugify(collection.name)}.data.json`;
}

export function materializeCollectionDocument(
  collection: CollectionDocument,
  rootPath: string,
  dataText = ''
) {
  const nextCollection = collectionDocumentSchema.parse(collection);
  const fileBase = `collections/${slugify(nextCollection.name)}`;
  const filePath = `${fileBase}${COLLECTION_SUFFIX}`;
  const shouldWriteData = dataText.trim().length > 0;
  const dataFile = shouldWriteData ? collectionDataFilePath({ ...nextCollection, dataFile: `${fileBase}.data.json` }) : undefined;
  const writes: WorkspaceFileWrite[] = [
    {
      path: rootPath ? `${rootPath}/${filePath}` : filePath,
      content: stringifyYamlDocument({
        ...nextCollection,
        dataFile
      })
    }
  ];

  if (shouldWriteData && dataFile) {
    writes.push({
      path: rootPath ? `${rootPath}/${dataFile}` : dataFile,
      content: dataText.trim()
    });
  }

  return writes;
}

export function materializeEnvironmentDocument(environment: EnvironmentDocument, rootPath: string) {
  return materializeEnvironmentDocuments(environment, rootPath)[0];
}

export function materializeEnvironmentDocuments(environment: EnvironmentDocument, rootPath: string) {
  const overlayMode = environment.overlayMode || 'standalone';
  const primaryName = slugify(environment.name);
  const sharedDocument = environmentDocumentSchema.parse({
    schemaVersion: environment.schemaVersion,
    name: environment.name,
    vars: environment.sharedVars ?? environment.vars,
    headers: environment.sharedHeaders ?? environment.headers,
    authProfiles: environment.authProfiles || []
  });
  const localDocument = environmentDocumentSchema.parse({
    schemaVersion: environment.schemaVersion,
    name: environment.name,
    vars: environment.localVars ?? {},
    headers: environment.localHeaders ?? [],
    authProfiles: overlayMode === 'standalone' && !environment.sharedFilePath ? environment.authProfiles || [] : []
  });
  const writes: WorkspaceFileWrite[] = [];

  const sharedPath =
    environment.sharedFilePath ||
    `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}.yaml`;
  const localPath =
    environment.localFilePath ||
    `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}${LOCAL_ENV_SUFFIX}`;

  if (overlayMode === 'overlay') {
    writes.push({
      path: sharedPath,
      content: stringifyYamlDocument(sharedDocument)
    });
    const hasLocalOverlay =
      Object.keys(localDocument.vars || {}).length > 0 || (localDocument.headers || []).length > 0;
    if (hasLocalOverlay) {
      writes.push({
        path: localPath,
        content: stringifyYamlDocument(localDocument)
      });
    }
    return writes;
  }

  const standalonePath =
    environment.localFilePath && !environment.sharedFilePath
      ? environment.localFilePath
      : `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}${environment.name === 'local' ? LOCAL_ENV_SUFFIX : '.yaml'}`;
  const standaloneDocument =
    environment.localFilePath && !environment.sharedFilePath ? localDocument : sharedDocument;
  writes.push({
    path: standalonePath,
    content: stringifyYamlDocument(standaloneDocument)
  });
  return writes;
}

export function materializeProjectDocument(project: ProjectDocument, rootPath: string) {
  return {
    path: `${rootPath ? `${rootPath}/` : ''}project.yaml`,
    content: stringifyYamlDocument(projectDocumentSchema.parse(project))
  };
}

export function applyEnvironmentVariables(input: string, environment: EnvironmentDocument | undefined) {
  if (!environment) return input;
  return interpolateString(input, [environment.vars]);
}

function mergeVariableSources(
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const sources = mergeTemplateSources({
    project,
    environment,
    extraSources
  });
  return sources;
}

function extraSourceMeta(source: Record<string, unknown>) {
  const meta = source.__debugSource;
  if (!meta || typeof meta !== 'object') return null;
  const label = typeof (meta as Record<string, unknown>).label === 'string' ? String((meta as Record<string, unknown>).label) : '';
  const kind = typeof (meta as Record<string, unknown>).kind === 'string' ? String((meta as Record<string, unknown>).kind) : 'runtime';
  return label ? { label, kind } : null;
}

export function createNamedTemplateSource(
  label: string,
  data: Record<string, unknown>,
  kind: 'runtime' | 'collection' | 'data-row' | 'step-output' | 'script' = 'runtime'
) {
  return {
    ...data,
    __debugSource: {
      label,
      kind
    }
  };
}

export function applyProjectVariables(
  input: string,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const variables = mergeVariableSources(project, environment, extraSources);
  return interpolateString(input, variables);
}

function templateTokens(input: string) {
  const output = new Set<string>();
  if (!input.includes('{{')) return [] as string[];
  input.replace(VARIABLE_PATTERN, (_match, token: string) => {
    const normalized = token.trim();
    if (normalized) output.add(normalized);
    return '';
  });
  return [...output];
}

function describeVariableSource(
  token: string,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const variables = mergeVariableSources(project, environment, extraSources);
  for (let index = 0; index < variables.length; index += 1) {
    const value = readPathValue(variables[index], token);
    if (value === undefined) continue;
    if (index < extraSources.length) {
      const meta = extraSourceMeta(extraSources[index]);
      return {
        source: 'extra' as const,
        sourceLabel: meta?.label || `runtime source ${index + 1}`,
        value: String(value ?? '')
      };
    }
    if (environment && index === extraSources.length) {
      const localVars = environment.localVars || {};
      const sharedVars = environment.sharedVars || environment.vars || {};
      const hasLocal = Object.prototype.hasOwnProperty.call(localVars, token.split('.')[0] || token);
      const hasShared = Object.prototype.hasOwnProperty.call(sharedVars, token.split('.')[0] || token);
      return {
        source: 'environment' as const,
        sourceLabel: hasLocal
          ? `environment local: ${environment.name}`
          : hasShared
            ? `environment shared: ${environment.name}`
            : `environment: ${environment.name}`,
        value: String(value ?? '')
      };
    }
    if (index === variables.length - 1) {
      return {
        source: 'builtin' as const,
        sourceLabel: 'builtin: baseUrl',
        value: String(value ?? '')
      };
    }
    return {
      source: 'project' as const,
      sourceLabel: 'project runtime',
      value: String(value ?? '')
    };
  }

  return {
    source: 'missing' as const,
    sourceLabel: 'missing',
    value: ''
  };
}

function collectResolvedField(
  input: {
    location: ResolvedFieldValue['location'];
    label: string;
    rawValue: string;
    resolvedValue: string;
  },
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>,
  bucket: Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >
) {
  const tokens = templateTokens(input.rawValue);
  tokens.forEach(token => {
    const lookup = describeVariableSource(token, project, environment, extraSources);
    const existing = bucket.get(token);
    if (existing) {
      existing.locations.add(`${input.location}:${input.label}`);
      if (existing.source === 'missing' && lookup.source !== 'missing') {
        existing.source = lookup.source;
        existing.sourceLabel = lookup.sourceLabel;
        existing.value = lookup.value;
        existing.missing = false;
      }
      return;
    }
    bucket.set(token, {
      token,
      source: lookup.source,
      sourceLabel: lookup.sourceLabel,
      value: lookup.value,
      missing: lookup.source === 'missing',
      locations: new Set([`${input.location}:${input.label}`])
    });
  });

  return resolvedFieldValueSchema.parse({
    ...input,
    tokens
  });
}

function mergeRows(baseRows: ParameterRow[], overrideRows?: ParameterRow[]) {
  const output: ParameterRow[] = [];
  const indexByName = new Map<string, number>();

  const applyRows = (rows?: ParameterRow[]) => {
    cleanRows(rows || []).forEach(row => {
      const key = row.name.trim().toLowerCase();
      const existingIndex = indexByName.get(key);
      if (existingIndex == null) {
        indexByName.set(key, output.length);
        output.push(row);
        return;
      }
      output[existingIndex] = row;
    });
  };

  applyRows(baseRows);
  applyRows(overrideRows);
  return output;
}

function mergeAuth(baseAuth: AuthConfig, overrideAuth?: AuthConfig, environment?: EnvironmentDocument) {
  const next = !overrideAuth || overrideAuth.type === 'inherit' ? authConfigSchema.parse(baseAuth) : authConfigSchema.parse(overrideAuth);
  if (next.type !== 'profile') {
    return {
      auth: next,
      authSource: next.type === 'inherit' ? 'inherit' : next.type,
      profileName: undefined as string | undefined
    };
  }

  const profile = environment?.authProfiles.find(item => item.name === next.profileName);
  if (!profile) {
    return {
      auth: authConfigSchema.parse({ type: 'none' }),
      authSource: `missing profile: ${next.profileName || 'unknown'}`,
      profileName: next.profileName
    };
  }

  return {
    auth: authConfigSchema.parse(profile.auth),
    authSource: `environment profile: ${profile.name}`,
    profileName: profile.name
  };
}

function resolveAuthValue(
  directValue: string | undefined,
  variableRef: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  if (variableRef?.trim()) {
    const token = variableRef.trim();
    const lookup = describeVariableSource(token, project, environment, extraSources);
    return {
      value: applyProjectVariables(`{{${token}}}`, project, environment, extraSources),
      sourceLabel: lookup.source === 'missing' ? `missing variable: ${token}` : `variable: ${token} (${lookup.sourceLabel})`
    };
  }

  return {
    value: applyProjectVariables(directValue || '', project, environment, extraSources),
    sourceLabel: directValue?.includes('{{') ? 'template expression' : 'inline value'
  };
}

function resolveOauthAccessTokenTarget(auth: AuthConfig) {
  const target = auth.tokenPlacement === 'query' ? 'query' : 'header';
  const name = auth.tokenName || (target === 'query' ? 'access_token' : 'Authorization');
  return { target, name };
}

function oauthCacheStatus(auth: AuthConfig) {
  if (!auth.accessToken) {
    return 'none' as const;
  }
  if (!auth.expiresAt) {
    return 'fresh' as const;
  }
  const expiresAt = Date.parse(auth.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return 'fresh' as const;
  }
  return expiresAt > Date.now() ? 'fresh' as const : 'expired' as const;
}

function buildResolvedAuthState(
  auth: AuthConfig,
  authSource: string,
  profileName: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  const state = {
    type: auth.type,
    source: authSource,
    profileName,
    tokenInjected: false,
    cacheStatus: 'none' as 'none' | 'fresh' | 'expired' | 'pending',
    expiresAt: auth.expiresAt,
    resolvedTokenUrl: undefined as string | undefined,
    missing: [] as string[],
    notes: [] as string[]
  };

  if (auth.type !== 'oauth2') {
    return state;
  }

  const tokenUrl = applyProjectVariables(auth.tokenUrl || '', project, environment, extraSources);
  const clientId = resolveAuthValue(auth.clientId || '', auth.clientIdFromVar, project, environment, extraSources).value;
  const clientSecret = resolveAuthValue(auth.clientSecret || '', auth.clientSecretFromVar, project, environment, extraSources).value;
  const cacheStatus = oauthCacheStatus(auth);

  state.cacheStatus = cacheStatus;
  state.resolvedTokenUrl = tokenUrl || undefined;
  if (!tokenUrl.trim()) state.missing.push('tokenUrl');
  if (!clientId.trim()) state.missing.push(auth.clientIdFromVar?.trim() || 'clientId');
  if (!clientSecret.trim()) state.missing.push(auth.clientSecretFromVar?.trim() || 'clientSecret');

  if (cacheStatus === 'fresh' && auth.accessToken) {
    state.tokenInjected = true;
    state.notes.push(profileName ? `Using cached OAuth token from profile "${profileName}".` : 'Using cached OAuth token.');
  } else if (cacheStatus === 'expired') {
    state.notes.push('Cached OAuth token has expired and will refresh on send.');
  } else if (state.missing.length === 0) {
    state.cacheStatus = 'pending';
    state.notes.push('OAuth token will be fetched automatically on send.');
  }

  return state;
}

function buildAuthPreview(
  auth: AuthConfig,
  authSource: string,
  profileName: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  const preview: ResolvedAuthPreviewItem[] = [];

  if (auth.type === 'bearer' && (auth.token || auth.tokenFromVar)) {
    const resolved = resolveAuthValue(auth.token, auth.tokenFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: `Bearer ${resolved.value}`,
        sourceLabel: resolved.sourceLabel,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'basic' && (auth.username || auth.usernameFromVar)) {
    const username = resolveAuthValue(auth.username, auth.usernameFromVar, project, environment, extraSources);
    const password = resolveAuthValue(auth.password || '', auth.passwordFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: `Basic ${encodeBasicAuth(username.value, password.value)}`,
        sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'apikey' && auth.key) {
    const resolved = resolveAuthValue(auth.value || '', auth.valueFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: auth.addTo || 'header',
        name: auth.key,
        value: resolved.value,
        sourceLabel: resolved.sourceLabel,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'oauth2') {
    const authState = buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources);
    const target = resolveOauthAccessTokenTarget(auth);
    if (authState.cacheStatus === 'fresh' && auth.accessToken) {
      const tokenPrefix = auth.tokenType || auth.tokenPrefix || 'Bearer';
      preview.push(
        resolvedAuthPreviewItemSchema.parse({
          target: target.target,
          name: target.name,
          value: target.target === 'header' ? `${tokenPrefix} ${auth.accessToken}` : auth.accessToken,
          sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
          status: 'cached',
          detail: auth.expiresAt ? `expires ${auth.expiresAt}` : 'cached token'
        })
      );
    } else {
      preview.push(
        resolvedAuthPreviewItemSchema.parse({
          target: target.target,
          name: target.name,
          value: '',
          sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
          status: authState.cacheStatus === 'expired' ? 'expired' : 'missing',
          detail: authState.notes[0] || 'OAuth token is not cached yet.'
        })
      );
    }
  }

  if (auth.type === 'oauth1') {
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: auth.addTo === 'query' ? 'query' : 'header',
        name: auth.addTo === 'query' ? 'oauth_signature' : 'Authorization',
        value: auth.consumerKey && auth.consumerSecret ? 'OAuth 1.0 signature will be computed from the resolved request.' : '',
        sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
        status: auth.consumerKey && auth.consumerSecret ? 'ready' : 'missing',
        detail: auth.signatureMethod || 'HMAC-SHA1'
      })
    );
  }

  if (auth.type === 'digest') {
    const missing = [
      ...(auth.username || auth.usernameFromVar ? [] : ['username']),
      ...(auth.password || auth.passwordFromVar ? [] : ['password']),
      ...(auth.realm ? [] : ['realm']),
      ...(auth.nonce ? [] : ['nonce'])
    ];
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: missing.length === 0 ? 'Digest auth header will be computed from the resolved request.' : '',
        sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
        status: missing.length === 0 ? 'ready' : 'missing',
        detail: missing.length ? `missing ${missing.join(', ')}` : auth.algorithm || 'MD5'
      })
    );
  }

  if (auth.type === 'ntlm') {
    const token = buildNtlmNegotiateHeader({
      auth,
      project,
      environment,
      extraSources
    });
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: token.header,
        sourceLabel: token.sourceLabel,
        status: token.header ? 'ready' : 'missing',
        detail: token.header
          ? `NTLM negotiate header (Type 1) · explicit credentials only`
          : `missing ${token.missing.join(', ')} · explicit credentials only`
      })
    );
  }

  if (auth.type === 'awsv4') {
    const missing = [
      ...(auth.accessKey ? [] : ['accessKey']),
      ...(auth.secretKey ? [] : ['secretKey']),
      ...(auth.region ? [] : ['region']),
      ...(auth.service ? [] : ['service'])
    ];
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: missing.length === 0 ? 'AWS Signature v4 will be computed from the resolved request.' : '',
        sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
        status: missing.length === 0 ? 'ready' : 'missing',
        detail: missing.length ? `missing ${missing.join(', ')}` : `${auth.region}/${auth.service}`
      })
    );
  }

  if (auth.type === 'wsse') {
    const token = buildWsseUsernameToken({
      auth,
      project,
      environment,
      extraSources,
      generateDynamicValues: true
    });
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'X-WSSE',
        value: token.header,
        sourceLabel: token.sourceLabel,
        status: token.missing.length === 0 ? 'ready' : 'missing',
        detail: token.missing.length ? `missing ${token.missing.join(', ')}` : 'UsernameToken'
      })
    );
  }

  return preview;
}

function mergeRuntime(request: RequestDocument, caseDocument: CaseDocument | undefined) {
  return runtimeSettingsSchema.parse({
    ...request.runtime,
    ...(caseDocument?.overrides.runtime || {})
  });
}

function encodeBasicAuth(username: string, password: string) {
  if (typeof btoa === 'function') {
    return btoa(`${username}:${password}`);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const source = `${username}:${password}`;
  let output = '';
  let index = 0;
  while (index < source.length) {
    const first = source.charCodeAt(index++);
    const second = source.charCodeAt(index++);
    const third = source.charCodeAt(index++);
    const missingSecond = Number.isNaN(second);
    const missingThird = Number.isNaN(third);
    const firstBlock = first >> 2;
    const secondBlock = ((first & 3) << 4) | ((second || 0) >> 4);
    const thirdBlock = missingSecond
      ? 64
      : ((second & 15) << 2) | ((third || 0) >> 6);
    const fourthBlock = missingSecond || missingThird ? 64 : third & 63;
    output +=
      alphabet.charAt(firstBlock) +
      alphabet.charAt(secondBlock) +
      alphabet.charAt(thirdBlock) +
      alphabet.charAt(fourthBlock);
  }
  return output;
}

function utf8Bytes(input: string) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(input));
  return Array.from(unescape(encodeURIComponent(input))).map(char => char.charCodeAt(0));
}

function base64Bytes(bytes: number[]) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] || 0;
    const second = bytes[index + 1] || 0;
    const third = bytes[index + 2] || 0;
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | (second >> 4)];
    output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | (third >> 6)] : '=';
    output += index + 2 < bytes.length ? alphabet[third & 63] : '=';
  }
  return output;
}

function bytesFromBase64(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = input.replace(/\s+/g, '').replace(/=+$/g, '');
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    bits = (bits << 6) | value;
    bitCount += 6;
    while (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
    }
  }
  return output;
}

function hexBytes(bytes: number[]) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const MD5_K = Array.from({ length: 64 }, (_value, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

function md5Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 0; shift <= 56; shift += 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16) | (bytes[position + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f = 0;
      let g = 0;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const rotated = (a + f + MD5_K[index] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + (((rotated << MD5_S[index]) | (rotated >>> (32 - MD5_S[index]))) >>> 0)) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].flatMap(word => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]);
}

function md5Hex(value: string) {
  return hexBytes(md5Bytes(utf8Bytes(value)));
}

const MD4_ROUND2_ORDER = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
const MD4_ROUND3_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md4Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 0; shift <= 56; shift += 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => {
      const start = offset + index * 4;
      return (
        bytes[start] |
        (bytes[start + 1] << 8) |
        (bytes[start + 2] << 16) |
        (bytes[start + 3] << 24)
      ) >>> 0;
    });
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    const f = (x: number, y: number, z: number) => ((x & y) | (~x & z)) >>> 0;
    const g = (x: number, y: number, z: number) => ((x & y) | (x & z) | (y & z)) >>> 0;
    const h = (x: number, y: number, z: number) => (x ^ y ^ z) >>> 0;

    for (let index = 0; index < 16; index += 4) {
      a = rotateLeft((a + f(b, c, d) + words[index]) >>> 0, 3);
      d = rotateLeft((d + f(a, b, c) + words[index + 1]) >>> 0, 7);
      c = rotateLeft((c + f(d, a, b) + words[index + 2]) >>> 0, 11);
      b = rotateLeft((b + f(c, d, a) + words[index + 3]) >>> 0, 19);
    }

    for (let index = 0; index < 16; index += 4) {
      a = rotateLeft((a + g(b, c, d) + words[MD4_ROUND2_ORDER[index]] + 0x5a827999) >>> 0, 3);
      d = rotateLeft((d + g(a, b, c) + words[MD4_ROUND2_ORDER[index + 1]] + 0x5a827999) >>> 0, 5);
      c = rotateLeft((c + g(d, a, b) + words[MD4_ROUND2_ORDER[index + 2]] + 0x5a827999) >>> 0, 9);
      b = rotateLeft((b + g(c, d, a) + words[MD4_ROUND2_ORDER[index + 3]] + 0x5a827999) >>> 0, 13);
    }

    for (let index = 0; index < 16; index += 4) {
      a = rotateLeft((a + h(b, c, d) + words[MD4_ROUND3_ORDER[index]] + 0x6ed9eba1) >>> 0, 3);
      d = rotateLeft((d + h(a, b, c) + words[MD4_ROUND3_ORDER[index + 1]] + 0x6ed9eba1) >>> 0, 9);
      c = rotateLeft((c + h(d, a, b) + words[MD4_ROUND3_ORDER[index + 2]] + 0x6ed9eba1) >>> 0, 11);
      b = rotateLeft((b + h(c, d, a) + words[MD4_ROUND3_ORDER[index + 3]] + 0x6ed9eba1) >>> 0, 15);
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].flatMap(word => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]);
}

function sha1Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 80; index += 1) {
      if (index < 16) {
        const position = offset + index * 4;
        words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
      } else {
        const value = words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16];
        words[index] = ((value << 1) | (value >>> 31)) >>> 0;
      }
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      const [f, k] =
        index < 20
          ? [((b & c) | (~b & d)) >>> 0, 0x5a827999]
          : index < 40
            ? [(b ^ c ^ d) >>> 0, 0x6ed9eba1]
            : index < 60
              ? [((b & c) | (b & d) | (c & d)) >>> 0, 0x8f1bbcdc]
              : [(b ^ c ^ d) >>> 0, 0xca62c1d6];
      const temp = ((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].flatMap(word => [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 64; index += 1) {
      if (index < 16) {
        const position = offset + index * 4;
        words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
      } else {
        const s0 = (((words[index - 15] >>> 7) | (words[index - 15] << 25)) ^ ((words[index - 15] >>> 18) | (words[index - 15] << 14)) ^ (words[index - 15] >>> 3)) >>> 0;
        const s1 = (((words[index - 2] >>> 17) | (words[index - 2] << 15)) ^ ((words[index - 2] >>> 19) | (words[index - 2] << 13)) ^ (words[index - 2] >>> 10)) >>> 0;
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[index] + words[index]) >>> 0;
      const s0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].flatMap(word => [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]);
}

function hmacBytes(key: number[], value: number[], hash: (bytes: number[]) => number[]) {
  const blockSize = 64;
  let keyBytes = [...key];
  if (keyBytes.length > blockSize) keyBytes = hash(keyBytes);
  while (keyBytes.length < blockSize) keyBytes.push(0);
  const outer = keyBytes.map(byte => byte ^ 0x5c);
  const inner = keyBytes.map(byte => byte ^ 0x36);
  return hash([...outer, ...hash([...inner, ...value])]);
}

function hmacSha1Base64(key: string, value: string) {
  return base64Bytes(hmacBytes(utf8Bytes(key), utf8Bytes(value), sha1Bytes));
}

function hmacSha256Bytes(key: number[] | string, value: string) {
  return hmacBytes(typeof key === 'string' ? utf8Bytes(key) : key, utf8Bytes(value), sha256Bytes);
}

function sha256Hex(value: string) {
  return hexBytes(sha256Bytes(utf8Bytes(value)));
}

function wsseQuotedValue(input: string) {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildWsseUsernameToken(input: {
  auth: AuthConfig;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
  generateDynamicValues?: boolean;
}) {
  const username = resolveAuthValue(input.auth.username, input.auth.usernameFromVar, input.project, input.environment, input.extraSources);
  const password = resolveAuthValue(input.auth.password || '', input.auth.passwordFromVar, input.project, input.environment, input.extraSources);
  const created = applyProjectVariables(
    input.auth.created || (input.generateDynamicValues === false ? '' : new Date().toISOString()),
    input.project,
    input.environment,
    input.extraSources
  );
  const nonce = applyProjectVariables(
    input.auth.nonce || (input.generateDynamicValues === false ? '' : createId('nonce')),
    input.project,
    input.environment,
    input.extraSources
  );
  const explicitDigest = applyProjectVariables(input.auth.passwordDigest || '', input.project, input.environment, input.extraSources);
  const digest = explicitDigest || (nonce && created && password.value ? base64Bytes(sha1Bytes(utf8Bytes(`${nonce}${created}${password.value}`))) : '');
  const missing = [
    ...(username.value.trim() ? [] : [input.auth.usernameFromVar?.trim() || 'username']),
    ...(digest.trim() ? [] : [input.auth.passwordFromVar?.trim() || 'password/passwordDigest']),
    ...(nonce.trim() ? [] : ['nonce']),
    ...(created.trim() ? [] : ['created'])
  ];

  return {
    header:
      missing.length === 0
        ? `UsernameToken Username="${wsseQuotedValue(username.value)}", PasswordDigest="${wsseQuotedValue(digest)}", Nonce="${wsseQuotedValue(nonce)}", Created="${wsseQuotedValue(created)}"`
        : '',
    sourceLabel: [
      username.sourceLabel,
      explicitDigest ? 'password digest' : password.sourceLabel,
      input.auth.nonce ? 'nonce' : 'generated nonce',
      input.auth.created ? 'created' : 'generated created'
    ].join('; '),
    missing
  };
}

function authQuotedValue(input: string) {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function utf16leBytes(input: string) {
  return Array.from(input).flatMap(char => {
    const code = char.charCodeAt(0);
    return [code & 0xff, (code >> 8) & 0xff];
  });
}

function littleEndian16(value: number) {
  return [value & 0xff, (value >> 8) & 0xff];
}

function littleEndian32(value: number) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function littleEndian64(value: bigint) {
  return Array.from({ length: 8 }, (_, index) => Number((value >> BigInt(index * 8)) & 0xffn));
}

function readLittleEndian16(bytes: number[], offset: number) {
  return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8);
}

function readLittleEndian32(bytes: number[], offset: number) {
  return (
    (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16) |
    ((bytes[offset + 3] || 0) << 24)
  ) >>> 0;
}

function readLittleEndian64(bytes: number[], offset: number) {
  let output = 0n;
  for (let index = 0; index < 8; index += 1) {
    output |= BigInt(bytes[offset + index] || 0) << BigInt(index * 8);
  }
  return output;
}

function ntlmSecurityBuffer(length: number, offset: number) {
  return [...littleEndian16(length), ...littleEndian16(length), ...littleEndian32(offset)];
}

function ntlmSecurityBufferValue(bytes: number[], offset: number) {
  const length = readLittleEndian16(bytes, offset);
  const valueOffset = readLittleEndian32(bytes, offset + 4);
  return bytes.slice(valueOffset, valueOffset + length);
}

function randomByteArray(length: number) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    return Array.from(cryptoApi.getRandomValues(new Uint8Array(length)));
  }
  return Array.from({ length }, () => Math.floor(Math.random() * 256));
}

function currentNtlmTimestamp() {
  return (BigInt(Date.now()) + 11644473600000n) * 10000n;
}

function parseNtlmChallenge(header: string) {
  const match = /(?:^|,\s*)NTLM\s+([A-Za-z0-9+/=]+)/i.exec(header);
  if (!match) return undefined;
  const bytes = bytesFromBase64(match[1]);
  if (bytes.length < 48 || String.fromCharCode(...bytes.slice(0, 8)) !== 'NTLMSSP\0') return undefined;
  if (readLittleEndian32(bytes, 8) !== 2) return undefined;
  const targetInfo = ntlmSecurityBufferValue(bytes, 40);
  let timestamp: bigint | undefined;
  for (let offset = 0; offset + 4 <= targetInfo.length;) {
    const avId = readLittleEndian16(targetInfo, offset);
    const avLength = readLittleEndian16(targetInfo, offset + 2);
    const valueOffset = offset + 4;
    if (avId === 0) break;
    if (avId === 7 && avLength === 8) {
      timestamp = readLittleEndian64(targetInfo, valueOffset);
    }
    offset = valueOffset + avLength;
  }
  return {
    token: match[1],
    flags: readLittleEndian32(bytes, 20),
    serverChallenge: bytes.slice(24, 32),
    targetInfo,
    timestamp
  };
}

function buildNtlmNegotiateHeader(input: {
  auth: AuthConfig;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
}) {
  const username = resolveAuthValue(input.auth.username, input.auth.usernameFromVar, input.project, input.environment, input.extraSources);
  const password = resolveAuthValue(input.auth.password || '', input.auth.passwordFromVar, input.project, input.environment, input.extraSources);
  const domain = applyProjectVariables(input.auth.domain || '', input.project, input.environment, input.extraSources).trim().toUpperCase();
  const workstation = applyProjectVariables(input.auth.workstation || 'YAPI-DEBUGGER', input.project, input.environment, input.extraSources).trim().toUpperCase();
  const missing = [
    ...(username.value.trim() ? [] : [input.auth.usernameFromVar?.trim() || 'username']),
    ...(password.value.trim() ? [] : [input.auth.passwordFromVar?.trim() || 'password'])
  ];
  if (missing.length > 0) {
    return {
      header: '',
      sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`,
      missing
    };
  }

  const domainBytes = utf16leBytes(domain);
  const workstationBytes = utf16leBytes(workstation);
  const payloadOffset = 32;
  const flags =
    0x00000001 | // NEGOTIATE_UNICODE
    0x00000004 | // REQUEST_TARGET
    0x00000200 | // NEGOTIATE_NTLM
    0x00008000 | // NEGOTIATE_ALWAYS_SIGN
    0x00080000; // NEGOTIATE_EXTENDED_SESSIONSECURITY
  const bytes = [
    ...utf8Bytes('NTLMSSP\0'),
    ...littleEndian32(1),
    ...littleEndian32(flags),
    ...ntlmSecurityBuffer(domainBytes.length, payloadOffset),
    ...ntlmSecurityBuffer(workstationBytes.length, payloadOffset + domainBytes.length),
    ...domainBytes,
    ...workstationBytes
  ];

  return {
    header: `NTLM ${base64Bytes(bytes)}`,
    sourceLabel: [username.sourceLabel, password.sourceLabel, domain ? 'domain' : '', workstation ? 'workstation' : '']
      .filter(Boolean)
      .join('; '),
    missing
  };
}

function buildNtlmAuthenticateHeader(input: {
  auth: AuthConfig;
  challenge: ReturnType<typeof parseNtlmChallenge>;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
}) {
  const username = resolveAuthValue(input.auth.username, input.auth.usernameFromVar, input.project, input.environment, input.extraSources);
  const password = resolveAuthValue(input.auth.password || '', input.auth.passwordFromVar, input.project, input.environment, input.extraSources);
  const domain = applyProjectVariables(input.auth.domain || '', input.project, input.environment, input.extraSources).trim();
  const workstation = applyProjectVariables(input.auth.workstation || 'YAPI-DEBUGGER', input.project, input.environment, input.extraSources).trim();
  const missing = [
    ...(username.value.trim() ? [] : [input.auth.usernameFromVar?.trim() || 'username']),
    ...(password.value.trim() ? [] : [input.auth.passwordFromVar?.trim() || 'password']),
    ...(input.challenge ? [] : ['challenge'])
  ];
  if (missing.length > 0 || !input.challenge) {
    return {
      header: '',
      sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`,
      missing
    };
  }

  const domainBytes = utf16leBytes(domain);
  const usernameBytes = utf16leBytes(username.value);
  const workstationBytes = utf16leBytes(workstation);
  const clientChallenge = randomByteArray(8);
  const targetInfo = input.challenge.targetInfo.length > 0 ? input.challenge.targetInfo : [0x00, 0x00, 0x00, 0x00];
  const timestamp = littleEndian64(input.challenge.timestamp || currentNtlmTimestamp());
  const blob = [
    0x01, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    ...timestamp,
    ...clientChallenge,
    0x00, 0x00, 0x00, 0x00,
    ...targetInfo,
    0x00, 0x00, 0x00, 0x00
  ];
  const ntHash = md4Bytes(utf16leBytes(password.value));
  const ntlmV2Hash = hmacBytes(ntHash, utf16leBytes(`${username.value.toUpperCase()}${domain}`), md5Bytes);
  const ntProof = hmacBytes(ntlmV2Hash, [...input.challenge.serverChallenge, ...blob], md5Bytes);
  const ntResponse = [...ntProof, ...blob];
  const lmResponse = [
    ...hmacBytes(ntlmV2Hash, [...input.challenge.serverChallenge, ...clientChallenge], md5Bytes),
    ...clientChallenge
  ];
  const payloadOffset = 64;
  const payload = [
    ...domainBytes,
    ...usernameBytes,
    ...workstationBytes,
    ...lmResponse,
    ...ntResponse
  ];
  const domainOffset = payloadOffset;
  const userOffset = domainOffset + domainBytes.length;
  const workstationOffset = userOffset + usernameBytes.length;
  const lmOffset = workstationOffset + workstationBytes.length;
  const ntOffset = lmOffset + lmResponse.length;
  const flags =
    (input.challenge.flags & (0x00000001 | 0x00000200 | 0x00008000 | 0x00080000 | 0x20000000 | 0x80000000)) |
    0x00000001 |
    0x00000200;
  const bytes = [
    ...utf8Bytes('NTLMSSP\0'),
    ...littleEndian32(3),
    ...ntlmSecurityBuffer(lmResponse.length, lmOffset),
    ...ntlmSecurityBuffer(ntResponse.length, ntOffset),
    ...ntlmSecurityBuffer(domainBytes.length, domainOffset),
    ...ntlmSecurityBuffer(usernameBytes.length, userOffset),
    ...ntlmSecurityBuffer(workstationBytes.length, workstationOffset),
    ...ntlmSecurityBuffer(0, ntOffset + ntResponse.length),
    ...littleEndian32(flags),
    ...payload
  ];

  return {
    header: `NTLM ${base64Bytes(bytes)}`,
    sourceLabel: [username.sourceLabel, password.sourceLabel, domain ? 'domain' : '', workstation ? 'workstation' : '', 'ntlm challenge']
      .filter(Boolean)
      .join('; '),
    missing
  };
}

function normalizeDigestNonceCount(input?: string) {
  const trimmed = input?.trim();
  if (!trimmed) return '00000001';
  if (/^[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.toLowerCase();
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed.toString(16).padStart(8, '0').slice(-8);
  return trimmed;
}

function digestUri(url: string, query: ParameterRow[]) {
  try {
    const parsed = new URL(url);
    query
      .filter(row => row.enabled && row.name.trim())
      .forEach(row => parsed.searchParams.append(row.name, row.value));
    return `${parsed.pathname || '/'}${parsed.search}`;
  } catch (_error) {
    const path = url.split('://').pop()?.replace(/^[^/]+/, '') || url || '/';
    return path.startsWith('/') ? path : `/${path}`;
  }
}

function buildDigestAuthorization(input: {
  auth: AuthConfig;
  method: string;
  url: string;
  query: ParameterRow[];
  body: RequestBody;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
}) {
  const username = resolveAuthValue(input.auth.username, input.auth.usernameFromVar, input.project, input.environment, input.extraSources);
  const password = resolveAuthValue(input.auth.password || '', input.auth.passwordFromVar, input.project, input.environment, input.extraSources);
  const realm = applyProjectVariables(input.auth.realm || '', input.project, input.environment, input.extraSources);
  const nonce = applyProjectVariables(input.auth.nonce || '', input.project, input.environment, input.extraSources);
  const qop = applyProjectVariables(input.auth.qop || 'auth', input.project, input.environment, input.extraSources).trim();
  const opaque = applyProjectVariables(input.auth.opaque || '', input.project, input.environment, input.extraSources);
  const algorithm = (applyProjectVariables(input.auth.algorithm || 'MD5', input.project, input.environment, input.extraSources).trim() || 'MD5').toUpperCase();
  const cnonce = applyProjectVariables(input.auth.cnonce || createId('cnonce'), input.project, input.environment, input.extraSources);
  const nonceCount = normalizeDigestNonceCount(input.auth.nonceCount);
  const uri = digestUri(input.url, input.query);
  const missing = [
    ...(username.value.trim() ? [] : [input.auth.usernameFromVar?.trim() || 'username']),
    ...(password.value.trim() ? [] : [input.auth.passwordFromVar?.trim() || 'password']),
    ...(realm.trim() ? [] : ['realm']),
    ...(nonce.trim() ? [] : ['nonce'])
  ];
  const supportedAlgorithm = algorithm === 'MD5' || algorithm === 'MD5-SESS';
  const supportedQop = !qop || qop === 'auth' || qop === 'auth-int';
  if (!supportedAlgorithm) missing.push('algorithm');
  if (!supportedQop) missing.push('qop');
  if (missing.length > 0) {
    return {
      header: '',
      sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`,
      missing
    };
  }

  const ha1Base = md5Hex(`${username.value}:${realm}:${password.value}`);
  const ha1 = algorithm === 'MD5-SESS' ? md5Hex(`${ha1Base}:${nonce}:${cnonce}`) : ha1Base;
  const entityHash = qop === 'auth-int' ? md5Hex(input.body.text || '') : undefined;
  const ha2 = md5Hex(
    qop === 'auth-int'
      ? `${input.method.toUpperCase()}:${uri}:${entityHash}`
      : `${input.method.toUpperCase()}:${uri}`
  );
  const response = qop ? md5Hex(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`) : md5Hex(`${ha1}:${nonce}:${ha2}`);
  const params = [
    ['username', username.value],
    ['realm', realm],
    ['nonce', nonce],
    ['uri', uri],
    ['response', response],
    ['algorithm', algorithm],
    ...(opaque ? [['opaque', opaque] as const] : []),
    ...(qop ? [['qop', qop] as const, ['nc', nonceCount] as const, ['cnonce', cnonce] as const] : [])
  ];
  return {
    header: `Digest ${params
      .map(([name, value]) => (name === 'algorithm' || name === 'qop' || name === 'nc' ? `${name}=${value}` : `${name}="${authQuotedValue(value)}"`))
      .join(', ')}`,
    sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}; realm; nonce`,
    missing
  };
}

function awsPercentEncode(input: string) {
  return encodeURIComponent(input)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeDecodeUriPart(input: string) {
  try {
    return decodeURIComponent(input);
  } catch (_error) {
    return input;
  }
}

function canonicalAwsPath(pathname: string) {
  const path = pathname || '/';
  return path
    .split('/')
    .map(segment => awsPercentEncode(safeDecodeUriPart(segment)))
    .join('/') || '/';
}

function canonicalAwsQuery(rows: ParameterRow[]) {
  return rows
    .filter(row => row.enabled && row.name.trim())
    .map(row => [awsPercentEncode(row.name), awsPercentEncode(row.value)] as const)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function formatAwsDate(input?: string) {
  if (input?.trim()) {
    const trimmed = input.trim();
    if (/^\d{8}T\d{6}Z$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().replace(/[:-]|\.\d{3}/g, '');
    }
  }
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function awsPayloadHash(body: RequestBody) {
  if (body.mode === 'file' || body.mode === 'multipart') return 'UNSIGNED-PAYLOAD';
  if (body.mode === 'form-urlencoded') {
    return sha256Hex(
      body.fields
        .filter(row => row.enabled && row.name.trim())
        .map(row => `${awsPercentEncode(row.name)}=${awsPercentEncode(row.value)}`)
        .join('&')
    );
  }
  if (body.mode === 'none') return sha256Hex('');
  return sha256Hex(body.text || '');
}

function buildAwsV4Signature(input: {
  auth: AuthConfig;
  method: string;
  url: string;
  headers: ParameterRow[];
  query: ParameterRow[];
  body: RequestBody;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
}) {
  const accessKey = resolveAuthValue(input.auth.accessKey || '', undefined, input.project, input.environment, input.extraSources).value;
  const secretKey = resolveAuthValue(input.auth.secretKey || '', undefined, input.project, input.environment, input.extraSources).value;
  const region = applyProjectVariables(input.auth.region || '', input.project, input.environment, input.extraSources).trim();
  const service = applyProjectVariables(input.auth.service || '', input.project, input.environment, input.extraSources).trim();
  const sessionToken = applyProjectVariables(input.auth.sessionToken || '', input.project, input.environment, input.extraSources).trim();
  const amzDate = formatAwsDate(input.auth.created);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = awsPayloadHash(input.body);
  const missing = [
    ...(accessKey.trim() ? [] : ['accessKey']),
    ...(secretKey.trim() ? [] : ['secretKey']),
    ...(region ? [] : ['region']),
    ...(service ? [] : ['service'])
  ];

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch (_error) {
    missing.push('url');
    parsed = new URL('https://invalid.local/');
  }

  if (missing.length > 0) {
    return {
      headers: [] as ParameterRow[],
      signedHeaders: '',
      authorization: '',
      missing
    };
  }

  const signingHeaders = [
    ...input.headers.filter(row => row.enabled && row.name.trim()),
    { name: 'host', value: parsed.host, enabled: true, kind: 'text' as const },
    { name: 'x-amz-content-sha256', value: payloadHash, enabled: true, kind: 'text' as const },
    { name: 'x-amz-date', value: amzDate, enabled: true, kind: 'text' as const },
    ...(sessionToken ? [{ name: 'x-amz-security-token', value: sessionToken, enabled: true, kind: 'text' as const }] : [])
  ];
  const headerMap = new Map<string, string>();
  signingHeaders.forEach(row => {
    const key = row.name.trim().toLowerCase();
    const value = String(row.value || '').trim().replace(/\s+/g, ' ');
    headerMap.set(key, headerMap.has(key) ? `${headerMap.get(key)},${value}` : value);
  });
  const sortedHeaderNames = [...headerMap.keys()].sort();
  const canonicalHeaders = sortedHeaderNames.map(name => `${name}:${headerMap.get(name)}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderNames.join(';');
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalAwsPath(parsed.pathname),
    canonicalAwsQuery(input.query),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const dateKey = hmacSha256Bytes(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmacSha256Bytes(dateKey, region);
  const serviceKey = hmacSha256Bytes(regionKey, service);
  const signingKey = hmacSha256Bytes(serviceKey, 'aws4_request');
  const signature = hexBytes(hmacSha256Bytes(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: [
      { name: 'x-amz-date', value: amzDate, enabled: true, kind: 'text' as const, filePath: undefined },
      { name: 'x-amz-content-sha256', value: payloadHash, enabled: true, kind: 'text' as const, filePath: undefined },
      ...(sessionToken ? [{ name: 'x-amz-security-token', value: sessionToken, enabled: true, kind: 'text' as const, filePath: undefined }] : []),
      { name: 'Authorization', value: authorization, enabled: true, kind: 'text' as const, filePath: undefined }
    ],
    signedHeaders,
    authorization,
    missing
  };
}

function oauthPercentEncode(input: string) {
  return encodeURIComponent(input)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizedOauthUrl(url: string) {
  try {
    const parsed = new URL(url);
    const defaultPort = (parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443');
    const port = parsed.port && !defaultPort ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}${parsed.pathname || '/'}`;
  } catch (_error) {
    return url.split('?')[0] || url;
  }
}

function oauthParameterString(rows: Array<{ name: string; value: string }>) {
  return rows
    .map(row => [oauthPercentEncode(row.name), oauthPercentEncode(row.value)] as const)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function buildOauth1Signature(input: {
  auth: AuthConfig;
  method: string;
  url: string;
  query: ParameterRow[];
  body: RequestBody;
  project: ProjectDocument;
  environment: EnvironmentDocument | undefined;
  extraSources: Array<Record<string, unknown>>;
}) {
  const consumerKey = resolveAuthValue(input.auth.consumerKey || '', undefined, input.project, input.environment, input.extraSources).value;
  const consumerSecret = resolveAuthValue(input.auth.consumerSecret || '', undefined, input.project, input.environment, input.extraSources).value;
  const token = resolveAuthValue(input.auth.token || '', input.auth.tokenFromVar, input.project, input.environment, input.extraSources).value;
  const tokenSecret = resolveAuthValue(input.auth.clientSecret || input.auth.value || '', input.auth.valueFromVar, input.project, input.environment, input.extraSources).value;
  const signatureMethod = (input.auth.signatureMethod || 'HMAC-SHA1').toUpperCase();
  const oauthParams = [
    { name: 'oauth_consumer_key', value: consumerKey },
    { name: 'oauth_nonce', value: input.auth.nonce || createId('nonce') },
    { name: 'oauth_signature_method', value: signatureMethod },
    { name: 'oauth_timestamp', value: input.auth.created || String(Math.floor(Date.now() / 1000)) },
    { name: 'oauth_version', value: input.auth.version || '1.0' },
    ...(token ? [{ name: 'oauth_token', value: token }] : [])
  ];
  const requestParams = input.query
    .filter(row => row.enabled && row.name.trim())
    .map(row => ({ name: row.name, value: row.value }));
  if (input.body.mode === 'form-urlencoded') {
    requestParams.push(
      ...input.body.fields
        .filter(row => row.enabled && row.name.trim())
        .map(row => ({ name: row.name, value: row.value }))
    );
  }
  const signingKey = `${oauthPercentEncode(consumerSecret)}&${oauthPercentEncode(tokenSecret)}`;
  const signature = signatureMethod === 'PLAINTEXT'
    ? signingKey
    : hmacSha1Base64(
        signingKey,
        [
          input.method.toUpperCase(),
          oauthPercentEncode(normalizedOauthUrl(input.url)),
          oauthPercentEncode(oauthParameterString([...requestParams, ...oauthParams]))
        ].join('&')
      );
  return {
    params: [...oauthParams, { name: 'oauth_signature', value: signature }],
    sourceLabel: [
      consumerKey ? 'consumer key' : 'missing consumer key',
      consumerSecret ? 'consumer secret' : 'missing consumer secret',
      token ? 'token' : 'no token'
    ].join('; ')
  };
}

function formatOauth1AuthorizationHeader(params: Array<{ name: string; value: string }>, realm?: string) {
  const headerParams = [
    ...(realm ? [{ name: 'realm', value: realm }] : []),
    ...params
  ];
  return `OAuth ${headerParams.map(row => `${oauthPercentEncode(row.name)}="${oauthPercentEncode(row.value)}"`).join(', ')}`;
}

function buildPreflightDiagnostics(
  preview: ResolvedRequestPreview,
  kind: RequestKind,
  auth: AuthConfig,
  authSource: string,
  body: RequestBody,
  variables: Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >
) {
  const diagnostics: ResolvedRequestInsight['diagnostics'] = [];
  const missingVariables = [...variables.values()].filter(item => item.missing);
  if (missingVariables.length > 0) {
    diagnostics.push({
      code: 'missing-variable',
      level: 'error',
      blocking: true,
      message: `Missing variables: ${missingVariables.map(item => item.token).join(', ')}`,
      field: 'variables'
    });
  }

  if (kind !== 'script') {
    if (!preview.url.trim()) {
      diagnostics.push({
        code: 'missing-url',
        level: 'error',
        blocking: true,
        message: 'Request URL is empty after resolution.',
        field: 'url'
      });
    } else if (!preview.url.includes('://')) {
      diagnostics.push({
        code: 'missing-base-url',
        level: 'error',
        blocking: true,
        message: 'Resolved URL is missing protocol/baseUrl. Configure the environment baseUrl before sending.',
        field: 'url'
      });
    }
  }

  if (kind !== 'script' && authSource.startsWith('missing profile')) {
    diagnostics.push({
      code: 'missing-auth-profile',
      level: 'error',
      blocking: true,
      message: authSource,
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'bearer' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')
  ) {
    diagnostics.push({
      code: 'incomplete-bearer-auth',
      level: 'error',
      blocking: true,
      message: 'Bearer auth is selected but no Authorization header could be produced.',
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'basic' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')
  ) {
    diagnostics.push({
      code: 'incomplete-basic-auth',
      level: 'error',
      blocking: true,
      message: 'Basic auth is selected but username/password are incomplete.',
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'apikey' &&
    (!auth.key || !preview.headers.concat(preview.query).some(item => item.enabled && item.name === auth.key))
  ) {
    diagnostics.push({
      code: 'incomplete-api-key-auth',
      level: 'error',
      blocking: true,
      message: 'API key auth is incomplete. Set both the key and its value source.',
      field: 'auth'
    });
  }

  if (kind !== 'script' && auth.type === 'oauth2') {
    const authState = preview.authState;
    if (authState?.missing.length) {
      diagnostics.push({
        code: 'incomplete-oauth2-auth',
        level: 'error',
        blocking: true,
        message: `OAuth2 client credentials setup is incomplete: ${authState.missing.join(', ')}`,
        field: 'auth'
      });
    }
    if (!authState?.resolvedTokenUrl && !auth.tokenUrl) {
      diagnostics.push({
        code: 'missing-oauth-token-url',
        level: 'error',
        blocking: true,
        message: 'OAuth2 auth is selected but no token URL could be resolved.',
        field: 'auth'
      });
    }
  }

  if (kind !== 'script' && auth.type === 'oauth1' && (!auth.consumerKey || !auth.consumerSecret)) {
    diagnostics.push({
      code: 'incomplete-oauth1-auth',
      level: 'error',
      blocking: true,
      message: 'OAuth1 auth requires both consumer key and consumer secret.',
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'awsv4' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')
  ) {
    diagnostics.push({
      code: 'incomplete-awsv4-auth',
      level: 'error',
      blocking: true,
      message: 'AWS Signature v4 auth requires access key, secret key, region, service, and an absolute URL.',
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'digest' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')
  ) {
    const hasCredentials = Boolean((auth.username || auth.usernameFromVar) && (auth.password || auth.passwordFromVar));
    diagnostics.push({
      code: hasCredentials ? 'digest-challenge-pending' : 'incomplete-digest-auth',
      level: hasCredentials ? 'warning' : 'error',
      blocking: !hasCredentials,
      message: hasCredentials
        ? 'Digest auth will send once without Authorization and retry after a WWW-Authenticate challenge.'
        : 'Digest auth requires username and password before a challenge can be attempted.',
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'ntlm' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')
  ) {
    diagnostics.push({
      code: 'incomplete-ntlm-auth',
      level: 'error',
      blocking: true,
      message: 'NTLM auth requires username and password to build the negotiate header.',
      field: 'auth'
    });
  }
  if (kind !== 'script' && auth.type === 'ntlm') {
    diagnostics.push({
      code: 'ntlm-native-credentials-unsupported',
      level: 'warning',
      blocking: false,
      message: NTLM_DESKTOP_CONSTRAINT_DETAIL,
      field: 'auth'
    });
  }

  if (
    kind !== 'script' &&
    auth.type === 'wsse' &&
    !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'x-wsse')
  ) {
    diagnostics.push({
      code: 'incomplete-wsse-auth',
      level: 'error',
      blocking: true,
      message: 'WSSE auth requires username plus either password or password digest.',
      field: 'auth'
    });
  }

  if (kind !== 'script' && body.mode === 'multipart') {
    const missingFiles = (preview.body.fields || []).filter(
      row => row.enabled && row.kind === 'file' && !String(row.filePath || row.value || '').trim()
    );
    if (missingFiles.length > 0) {
      diagnostics.push({
        code: 'missing-multipart-file',
        level: 'error',
        blocking: true,
        message: `Multipart fields are missing file paths: ${missingFiles.map(item => item.name).join(', ')}`,
        field: 'body'
      });
    }
  }

  if (kind !== 'script' && hasInvalidGraphqlVariables(body)) {
    diagnostics.push({
      code: 'invalid-graphql-variables',
      level: 'error',
      blocking: true,
      message: 'GraphQL variables must be valid JSON before the request can be sent.',
      field: 'body'
    });
  }

  if (kind === 'grpc') {
    if (!preview.body.grpc?.protoFile?.trim()) {
      diagnostics.push({
        code: 'missing-grpc-proto',
        level: 'error',
        blocking: true,
        message: 'gRPC requests require a proto file before they can run.',
        field: 'body'
      });
    }
    if (!preview.body.grpc?.service?.trim()) {
      diagnostics.push({
        code: 'missing-grpc-service',
        level: 'error',
        blocking: true,
        message: 'gRPC requests require a fully qualified service name.',
        field: 'body'
      });
    }
    if (!preview.body.grpc?.method?.trim()) {
      diagnostics.push({
        code: 'missing-grpc-method',
        level: 'error',
        blocking: true,
        message: 'gRPC requests require a method name.',
        field: 'body'
      });
    }
  }

  return diagnostics;
}

function effectiveRequestKind(request: RequestDocument, caseDocument?: CaseDocument) {
  return (caseDocument?.overrides.kind || request.kind) as RequestKind;
}

function scriptRequestSource(request: RequestDocument, caseDocument?: CaseDocument) {
  const body = caseDocument?.overrides.body ?? request.body;
  return body.text || request.scripts.preRequest || '';
}

function scriptRequestUsesLegacyPreRequestSource(request: RequestDocument, caseDocument?: CaseDocument) {
  const body = caseDocument?.overrides.body ?? request.body;
  return effectiveRequestKind(request, caseDocument) === 'script' && !body.text.trim() && Boolean(request.scripts.preRequest.trim());
}

function grpcRequestPath(grpc?: RequestBody['grpc']) {
  const service = grpc?.service?.trim() || '';
  const method = grpc?.method?.trim() || '';
  if (!service && !method) return '/';
  return `/${[service, method].filter(Boolean).join('/')}`;
}

function buildScriptRunResponse(input: {
  request: RequestDocument;
  preview: ResolvedRequestPreview;
  logs: ScriptLog[];
  checkResults: CheckResult[];
}) {
  const bodyText = JSON.stringify({
    runtime: 'script',
    requestId: input.request.id,
    requestName: input.request.name,
    checks: {
      total: input.checkResults.length,
      failed: input.checkResults.filter(item => !item.ok).length
    },
    logs: input.logs.length
  }, null, 2);
  const response: SendRequestResult = {
    ok: true,
    status: 200,
    statusText: 'Script Executed',
    url: input.preview.url,
    durationMs: 0,
    sizeBytes: utf8Bytes(bodyText).length,
    headers: [
      { name: 'content-type', value: 'application/json' },
      { name: 'x-debugger-runtime', value: 'script' }
    ],
    bodyText,
    timestamp: new Date().toISOString()
  };
  return response;
}

function buildSkippedRunResponse(input: {
  request: RequestDocument;
  preview: ResolvedRequestPreview;
}) {
  const bodyText = JSON.stringify(
    {
      runtime: 'script-flow',
      action: 'skip-request',
      requestId: input.request.id,
      requestName: input.request.name
    },
    null,
    2
  );
  return sendRequestResultSchema.parse({
    ok: true,
    status: 200,
    statusText: 'Skipped by Script',
    url: input.preview.url,
    durationMs: 0,
    sizeBytes: utf8Bytes(bodyText).length,
    headers: [
      { name: 'content-type', value: 'application/json' },
      { name: 'x-debugger-runtime', value: 'script-flow' },
      { name: 'x-debugger-skip-request', value: 'true' }
    ],
    bodyText,
    timestamp: new Date().toISOString()
  });
}

export function inspectResolvedRequest(
  project: ProjectDocument,
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const kind = effectiveRequestKind(request, caseDocument);
  const legacyScriptSource = scriptRequestUsesLegacyPreRequestSource(request, caseDocument);
  const preview = resolveRequest(project, request, caseDocument, environment, extraSources);
  const body = caseDocument?.overrides.body ?? request.body;
  const authInput = caseDocument?.overrides.auth || request.auth;
  const scriptSource = joinScriptBlocks(
    kind === 'script' ? scriptRequestSource(request, caseDocument) : '',
    legacyScriptSource ? '' : request.scripts.preRequest,
    request.scripts.postResponse,
    request.scripts.tests,
    caseDocument?.scripts?.preRequest,
    caseDocument?.scripts?.postResponse
  );
  const { auth, authSource, profileName } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
  const queryRows = caseDocument?.overrides.query ?? request.query;
  const pathRows = caseDocument?.overrides.pathParams ?? request.pathParams;
  const headerRows = mergeRows(
    [...project.runtime.headers, ...(environment?.headers || []), ...request.headers],
    caseDocument?.overrides.headers
  );
  const fields: ResolvedFieldValue[] = [];
  const variables = new Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >();

  fields.push(
    collectResolvedField(
      {
        location: 'url',
        label: 'Request URL',
        rawValue: caseDocument?.overrides.url || request.url,
        resolvedValue: preview.url
      },
      project,
      environment,
      extraSources,
      variables
    )
  );
  fields.push(
    collectResolvedField(
      {
        location: 'path',
        label: 'Request Path',
        rawValue: caseDocument?.overrides.path || request.path || '',
        resolvedValue: preview.requestPath
      },
      project,
      environment,
      extraSources,
      variables
    )
  );

  headerRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'header',
          label: row.name || `Header ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue:
            preview.headers.find(item => item.name === row.name)?.value || preview.headers[index]?.value || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  queryRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'query',
          label: row.name || `Query ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue: preview.query.find(item => item.name === row.name)?.value || preview.query[index]?.value || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  pathRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'path',
          label: row.name || `Path Variable ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue: row.value ? applyProjectVariables(row.value, project, environment, extraSources) : ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  if (body.text) {
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: 'Body Text',
          rawValue: body.text,
          resolvedValue: preview.body.text
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  }

  if (body.mode === 'graphql' && body.graphql) {
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: 'GraphQL Query',
          rawValue: body.graphql.query || '',
          resolvedValue: preview.body.graphql?.query || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
    if (body.graphql.variables) {
      fields.push(
        collectResolvedField(
          {
            location: 'body',
            label: 'GraphQL Variables',
            rawValue: body.graphql.variables,
            resolvedValue: preview.body.graphql?.variables || ''
          },
          project,
          environment,
          extraSources,
          variables
        )
      );
    }
  }

  if (kind === 'grpc' && body.grpc) {
    if (body.grpc.protoFile) {
      fields.push(
        collectResolvedField(
          {
            location: 'body',
            label: 'gRPC Proto File',
            rawValue: body.grpc.protoFile,
            resolvedValue: preview.body.grpc?.protoFile || ''
          },
          project,
          environment,
          extraSources,
          variables
        )
      );
    }
    (body.grpc.importPaths || []).forEach((importPath, index) => {
      fields.push(
        collectResolvedField(
          {
            location: 'body',
            label: `gRPC Import Path ${index + 1}`,
            rawValue: importPath,
            resolvedValue: preview.body.grpc?.importPaths?.[index] || ''
          },
          project,
          environment,
          extraSources,
          variables
        )
      );
    });
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: 'gRPC Service',
          rawValue: body.grpc.service || '',
          resolvedValue: preview.body.grpc?.service || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: 'gRPC Method',
          rawValue: body.grpc.method || '',
          resolvedValue: preview.body.grpc?.method || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
    if (body.grpc.message) {
      fields.push(
        collectResolvedField(
          {
            location: 'body',
            label: 'gRPC Message',
            rawValue: body.grpc.message,
            resolvedValue: preview.body.grpc?.message || ''
          },
          project,
          environment,
          extraSources,
          variables
        )
      );
    }
  }

  body.fields.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: row.name || `Body Field ${index + 1}`,
          rawValue: row.kind === 'file' ? row.filePath || row.value || '' : row.value || '',
          resolvedValue:
            preview.body.fields.find(field => field.name === row.name)?.filePath ||
            preview.body.fields.find(field => field.name === row.name)?.value ||
            ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  const authPreview = buildAuthPreview(auth, authSource, profileName, project, environment, extraSources);
  const authState = buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources);
  authPreview.forEach(item => {
    const rawValue =
      authInput.type === 'bearer'
        ? authInput.tokenFromVar
          ? `{{${authInput.tokenFromVar}}}`
          : authInput.token || ''
        : authInput.type === 'basic'
          ? `${authInput.usernameFromVar ? `{{${authInput.usernameFromVar}}}` : authInput.username || ''}:${authInput.passwordFromVar ? `{{${authInput.passwordFromVar}}}` : authInput.password || ''}`
            : authInput.type === 'apikey'
              ? authInput.valueFromVar
                ? `{{${authInput.valueFromVar}}}`
                : authInput.value || ''
            : authInput.type === 'oauth2'
              ? [
                  authInput.tokenUrl || '',
                  authInput.clientIdFromVar ? `{{${authInput.clientIdFromVar}}}` : authInput.clientId || '',
                  authInput.clientSecretFromVar ? `{{${authInput.clientSecretFromVar}}}` : authInput.clientSecret || '',
                  authInput.scope || ''
                ].filter(Boolean).join(' | ')
            : authInput.type === 'wsse'
              ? [
                  authInput.usernameFromVar ? `{{${authInput.usernameFromVar}}}` : authInput.username || '',
                  authInput.passwordDigest ||
                    (authInput.passwordFromVar ? `{{${authInput.passwordFromVar}}}` : authInput.password || ''),
                  authInput.nonce || '',
                  authInput.created || ''
                ].filter(Boolean).join(' | ')
            : authInput.type === 'awsv4'
              ? [
                  authInput.accessKey || '',
                  authInput.secretKey || '',
                  authInput.region || '',
                  authInput.service || '',
                  authInput.sessionToken || ''
                ].filter(Boolean).join(' | ')
            : authInput.type === 'digest'
              ? [
                  authInput.usernameFromVar ? `{{${authInput.usernameFromVar}}}` : authInput.username || '',
                  authInput.passwordFromVar ? `{{${authInput.passwordFromVar}}}` : authInput.password || '',
                  authInput.realm || '',
                  authInput.nonce || '',
                  authInput.qop || '',
                  authInput.algorithm || ''
                ].filter(Boolean).join(' | ')
            : '';
    fields.push(
      collectResolvedField(
        {
          location: 'auth',
          label: item.name,
          rawValue,
          resolvedValue: item.value
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  const warnings: ResolvedRequestInsight['warnings'] = [];
  const missingVariables = [...variables.values()].filter(item => item.missing);
  if (missingVariables.length > 0) {
    warnings.push({
      code: 'missing-variable',
      level: 'warning',
      message: `Unresolved variables: ${missingVariables.map(item => item.token).join(', ')}`
    });
  }
  if (preview.url.includes('{{')) {
    warnings.push({
      code: 'url-template-leftover',
      level: 'warning',
      message: 'The resolved URL still contains unresolved template variables.'
    });
  }
  if (authSource.startsWith('missing profile')) {
    warnings.push({
      code: 'missing-auth-profile',
      level: 'warning',
      message: `Auth profile "${authInput.profileName || 'unknown'}" was not found in the active environment.`
    });
  }
  if (
    (auth.type === 'bearer' && !auth.token && !auth.tokenFromVar) ||
    (auth.type === 'basic' && !auth.username && !auth.usernameFromVar) ||
    (auth.type === 'apikey' && !auth.key) ||
    (auth.type === 'oauth1' && (!auth.consumerKey || !auth.consumerSecret)) ||
    (auth.type === 'awsv4' && (!auth.accessKey || !auth.secretKey || !auth.region || !auth.service)) ||
    (auth.type === 'digest' && ((!auth.username && !auth.usernameFromVar) || (!auth.password && !auth.passwordFromVar))) ||
    (auth.type === 'ntlm' && ((!auth.username && !auth.usernameFromVar) || (!auth.password && !auth.passwordFromVar))) ||
    (auth.type === 'wsse' && ((!auth.username && !auth.usernameFromVar) || (!auth.password && !auth.passwordFromVar && !auth.passwordDigest)))
  ) {
    warnings.push({
      code: 'incomplete-auth',
      level: 'warning',
      message: `The configured ${auth.type} auth is incomplete and will not be fully applied.`
    });
  }

  const diagnostics = buildPreflightDiagnostics(preview, kind, auth, authSource, body, variables);
  const scriptSignals = inspectScriptSource(scriptSource);
  scriptSignals.forEach(signal => {
    warnings.push({
      code: signal.code,
      level: signal.level === 'error' ? 'warning' : signal.level,
      message: signal.message
    });
    diagnostics.push({
      code: signal.code,
      level: signal.level,
      blocking: false,
      message: signal.message,
      field: 'scripts'
    });
  });

  return resolvedRequestInsightSchema.parse({
    preview: {
      ...preview,
      authState
    },
    variables: [...variables.values()].map(item => ({
      ...item,
      locations: [...item.locations]
    })),
    fieldValues: fields,
    warnings,
    diagnostics,
    authPreview
  });
}

export function resolveRequest(
  project: ProjectDocument,
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
): ResolvedRequest {
  const kind = effectiveRequestKind(request, caseDocument);
  const body = caseDocument?.overrides.body ?? request.body;
  const { auth, authSource, profileName } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
  const runtime = mergeRuntime(request, caseDocument);
  const rawUrl = caseDocument?.overrides.url || request.url;
  const resolvedUrl = applyProjectVariables(rawUrl, project, environment, extraSources);
  const urlParts = splitUrlAndQueryRows(resolvedUrl);
  const path = applyProjectVariables(caseDocument?.overrides.path || request.path || '', project, environment, extraSources);
  const baseHeaders = [
    ...project.runtime.headers,
    ...(environment?.headers || []),
    ...request.headers
  ];
  const explicitQueryRows =
    caseDocument && caseDocument.overrides.query !== undefined
      ? caseDocument.overrides.query
      : request.query;
  const headers = mergeRows(baseHeaders, caseDocument?.overrides.headers).map((row: ParameterRow) => ({
    ...row,
    value: applyProjectVariables(row.value, project, environment, extraSources),
    filePath: row.filePath ? applyProjectVariables(row.filePath, project, environment, extraSources) : row.filePath
  }));
  const query = mergeRows(
    explicitQueryRows.length > 0 ? explicitQueryRows : urlParts.query,
    undefined
  ).map((row: ParameterRow) => ({
    ...row,
    value: applyProjectVariables(row.value, project, environment, extraSources)
  }));

  const resolvedBody = normalizeBody(body);
  const interpolatedBody = {
    ...resolvedBody,
    text: applyProjectVariables(resolvedBody.text, project, environment, extraSources),
    file: resolvedBody.file ? applyProjectVariables(resolvedBody.file, project, environment, extraSources) : resolvedBody.file,
    graphql: resolvedBody.graphql
      ? {
          ...resolvedBody.graphql,
          query: applyProjectVariables(resolvedBody.graphql.query || '', project, environment, extraSources),
          variables: applyProjectVariables(resolvedBody.graphql.variables || '', project, environment, extraSources),
          operationName: resolvedBody.graphql.operationName
            ? applyProjectVariables(resolvedBody.graphql.operationName, project, environment, extraSources)
            : resolvedBody.graphql.operationName,
          schemaUrl: resolvedBody.graphql.schemaUrl
            ? applyProjectVariables(resolvedBody.graphql.schemaUrl, project, environment, extraSources)
            : resolvedBody.graphql.schemaUrl
        }
      : resolvedBody.graphql,
    websocket: resolvedBody.websocket
      ? {
          ...resolvedBody.websocket,
          messages: resolvedBody.websocket.messages.map(message => ({
            ...message,
            name: applyProjectVariables(message.name || '', project, environment, extraSources),
            body: applyProjectVariables(message.body || '', project, environment, extraSources)
          }))
        }
      : resolvedBody.websocket,
    grpc: resolvedBody.grpc
      ? {
          ...resolvedBody.grpc,
          protoFile: resolvedBody.grpc.protoFile
            ? applyProjectVariables(resolvedBody.grpc.protoFile, project, environment, extraSources)
            : resolvedBody.grpc.protoFile,
          importPaths: (resolvedBody.grpc.importPaths || []).map(item =>
            applyProjectVariables(item, project, environment, extraSources)
          ),
          service: resolvedBody.grpc.service
            ? applyProjectVariables(resolvedBody.grpc.service, project, environment, extraSources)
            : resolvedBody.grpc.service,
          method: resolvedBody.grpc.method
            ? applyProjectVariables(resolvedBody.grpc.method, project, environment, extraSources)
            : resolvedBody.grpc.method,
          message: applyProjectVariables(resolvedBody.grpc.message || '', project, environment, extraSources)
        }
      : resolvedBody.grpc,
    fields: resolvedBody.fields.map((row: ParameterRow) => ({
      ...row,
      value: applyProjectVariables(row.value, project, environment, extraSources),
      filePath: row.filePath ? applyProjectVariables(row.filePath, project, environment, extraSources) : row.filePath
    }))
  };
  const mergedBody = materializeGraphqlBody(requestBodySchema.parse(interpolatedBody));
  if (kind === 'script') {
    const syntheticUrl = resolvedUrl.trim() || `script://${request.id}`;
    return interpolateResolvedRequest(resolvedRequestPreviewSchema.parse({
      name: caseDocument ? `${request.name} / ${caseDocument.name}` : request.name,
      environmentName: caseDocument?.environment || environment?.name,
      authSource,
      requestPath: path || request.path || '/',
      method: caseDocument?.overrides.method || request.method,
      url: syntheticUrl,
      headers,
      query,
      body: requestBodySchema.parse({
        ...mergedBody,
        mode: 'text',
        mimeType: mergedBody.mimeType || 'application/javascript',
        text: scriptRequestSource(request, caseDocument)
      }),
      timeoutMs: runtime.timeoutMs,
      followRedirects: runtime.followRedirects,
      authState: buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources)
    }), extraSources);
  }

  const mergedVariables = mergeVariableSources(project, environment, extraSources);
  let candidateUrl = urlParts.url;
  if (!candidateUrl || (!candidateUrl.includes('://') && !rawUrl.startsWith('{{'))) {
    const baseUrl = String(readPathValue(mergedVariables[mergedVariables.length - 1], 'baseUrl') || '');
    candidateUrl = `${baseUrl}${candidateUrl || path || ''}`;
  }

  const authHeaders = [...headers];
  const authQuery = [...query];
  if (auth.type === 'bearer' && (auth.token || auth.tokenFromVar)) {
    const resolved = resolveAuthValue(auth.token, auth.tokenFromVar, project, environment, extraSources);
    authHeaders.push({
      name: 'Authorization',
      value: `Bearer ${resolved.value}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }
  if (auth.type === 'apikey' && auth.key) {
    const target = auth.addTo || 'header';
    const resolved = resolveAuthValue(auth.value || '', auth.valueFromVar, project, environment, extraSources);
    const row = {
      name: auth.key,
      value: resolved.value,
      enabled: true,
      kind: 'text' as const,
      filePath: undefined
    };
    if (target === 'query') {
      authQuery.push(row);
    } else {
      authHeaders.push(row);
    }
  }
  if (auth.type === 'basic' && (auth.username || auth.usernameFromVar)) {
    const username = resolveAuthValue(auth.username, auth.usernameFromVar, project, environment, extraSources);
    const password = resolveAuthValue(auth.password || '', auth.passwordFromVar, project, environment, extraSources);
    const value = encodeBasicAuth(username.value, password.value);
    authHeaders.push({
      name: 'Authorization',
      value: `Basic ${value}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }
  if (auth.type === 'oauth2') {
    const cacheStatus = oauthCacheStatus(auth);
    if (cacheStatus === 'fresh' && auth.accessToken) {
      const target = resolveOauthAccessTokenTarget(auth);
      const tokenPrefix = auth.tokenType || auth.tokenPrefix || 'Bearer';
      const row = {
        name: target.name,
        value: target.target === 'header' ? `${tokenPrefix} ${auth.accessToken}` : auth.accessToken,
        enabled: true,
        kind: 'text' as const,
        filePath: undefined
      };
      if (target.target === 'query') {
        authQuery.push(row);
      } else {
        authHeaders.push(row);
      }
    }
  }
  if (auth.type === 'oauth1' && auth.consumerKey && auth.consumerSecret) {
    const signed = buildOauth1Signature({
      auth,
      method: caseDocument?.overrides.method || request.method,
      url: candidateUrl,
      query: authQuery,
      body: mergedBody,
      project,
      environment,
      extraSources
    });
    if (auth.addTo === 'query') {
      signed.params.forEach(row => {
        authQuery.push({ ...row, enabled: true, kind: 'text' as const, filePath: undefined });
      });
    } else {
      authHeaders.push({
        name: 'Authorization',
        value: formatOauth1AuthorizationHeader(signed.params, auth.realm),
        enabled: true,
        kind: 'text',
        filePath: undefined
      });
    }
  }
  if (auth.type === 'awsv4') {
    const signed = buildAwsV4Signature({
      auth,
      method: caseDocument?.overrides.method || request.method,
      url: candidateUrl,
      headers: authHeaders,
      query: authQuery,
      body: mergedBody,
      project,
      environment,
      extraSources
    });
    signed.headers.forEach(row => {
      authHeaders.push({ ...row, filePath: row.filePath });
    });
  }
  if (auth.type === 'digest') {
    const digest = buildDigestAuthorization({
      auth,
      method: caseDocument?.overrides.method || request.method,
      url: candidateUrl,
      query: authQuery,
      body: mergedBody,
      project,
      environment,
      extraSources
    });
    if (digest.header) {
      authHeaders.push({
        name: 'Authorization',
        value: digest.header,
        enabled: true,
        kind: 'text',
        filePath: undefined
      });
    }
  }
  if (auth.type === 'ntlm') {
    const token = buildNtlmNegotiateHeader({
      auth,
      project,
      environment,
      extraSources
    });
    if (token.header) {
      authHeaders.push({
        name: 'Authorization',
        value: token.header,
        enabled: true,
        kind: 'text',
        filePath: undefined
      });
    }
  }
  if (auth.type === 'wsse') {
    const token = buildWsseUsernameToken({
      auth,
      project,
      environment,
      extraSources,
      generateDynamicValues: true
    });
    if (token.header) {
      authHeaders.push({
        name: 'X-WSSE',
        value: token.header,
        enabled: true,
        kind: 'text',
        filePath: undefined
      });
    }
  }

  return interpolateResolvedRequest(resolvedRequestPreviewSchema.parse({
    name: caseDocument ? `${request.name} / ${caseDocument.name}` : request.name,
    environmentName: caseDocument?.environment || environment?.name,
    authSource,
    requestPath: path || request.path || (kind === 'grpc' ? grpcRequestPath(mergedBody.grpc) : '/'),
    method: caseDocument?.overrides.method || request.method,
    url: candidateUrl,
    headers: authHeaders,
    query: authQuery,
    body: mergedBody,
    timeoutMs: runtime.timeoutMs,
    followRedirects: runtime.followRedirects,
    authState: buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources)
  }), extraSources);
}

export function createEmptyCheck(type: CaseCheck['type'] = 'status-equals'): CaseCheck {
  return caseCheckSchema.parse({
    id: createId('check'),
    type,
    label: '',
    enabled: true,
    path:
      type === 'header-includes' || type === 'header-equals'
        ? 'content-type'
        : type.startsWith('json-') || type.startsWith('number-')
          ? '$.data'
          : '',
    expected:
      type === 'status-equals'
        ? '200'
        : type === 'response-time-lt'
          ? '1000'
          : type === 'json-type'
            ? 'string'
            : type === 'json-length'
              ? '1'
              : type === 'number-between'
                ? '0,1'
          : ''
  });
}

export type RuntimeSendRequest = (request: SendRequestInput | ResolvedRequestPreview) => Promise<SendRequestResult>;

export type RequestRunContext = {
  extraSources?: Array<Record<string, unknown>>;
  state?: {
    variables: Record<string, string>;
    environment: EnvironmentDocument;
  };
  iterationData?: Record<string, unknown>;
  iteration?: number;
  iterationCount?: number;
  collectionScripts?: RequestScripts;
  collectionRules?: {
    requireSuccessStatus: boolean;
    maxDurationMs?: number;
    requiredJsonPaths?: string[];
  };
  sourceCollection?: {
    id: string;
    name: string;
    stepKey: string;
  };
};

export type PreparedRequestRunInput = {
  workspace: WorkspaceIndex;
  request: RequestDocument;
  caseDocument?: CaseDocument;
  sendRequest: RuntimeSendRequest;
  sessionId?: string;
  context?: RequestRunContext;
};

export type PreparedRequestRunResult = {
  preview: ResolvedRequestPreview;
  response: SendRequestResult;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  skipped?: boolean;
  execution: ScriptExecutionFlow;
  state: {
    variables: Record<string, string>;
    environment: EnvironmentDocument;
  };
};

export type CollectionRunFilters = {
  tags?: string[];
  stepKeys?: string[];
  requestIds?: string[];
  caseIds?: string[];
};

export type CollectionRunOptions = {
  environmentName?: string;
  stepKeys?: string[];
  seedReport?: CollectionRunReport | null;
  filters?: CollectionRunFilters;
  failFast?: boolean;
};

function joinScriptBlocks(...sources: Array<string | undefined>) {
  return sources
    .map(source => source?.trim() || '')
    .filter(Boolean)
    .join('\n\n');
}

function mergeScriptExecutionFlows(...flows: ScriptExecutionFlow[]): ScriptExecutionFlow {
  return flows.reduce<ScriptExecutionFlow>(
    (merged, flow) => ({
      skipRequest: merged.skipRequest || flow.skipRequest,
      nextRequestSet: flow.nextRequestSet ? true : merged.nextRequestSet,
      nextRequest: flow.nextRequestSet ? flow.nextRequest : merged.nextRequest
    }),
    {
      skipRequest: false,
      nextRequestSet: false,
      nextRequest: null
    }
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildStepOutput(preview: ResolvedRequestPreview, response: SendRequestResult) {
  const headerMap = Object.fromEntries(response.headers.map(item => [item.name.toLowerCase(), item.value]));
  let parsedBody: unknown = response.bodyText;
  try {
    parsedBody = JSON.parse(response.bodyText);
  } catch (_error) {
    parsedBody = response.bodyText;
  }

  return {
    request: {
      method: preview.method,
      url: preview.url,
      query: Object.fromEntries(preview.query.filter(item => item.enabled && item.name.trim()).map(item => [item.name, item.value])),
      headers: Object.fromEntries(preview.headers.filter(item => item.enabled && item.name.trim()).map(item => [item.name.toLowerCase(), item.value])),
      body: preview.body.text
    },
    response: {
      status: response.status,
      durationMs: response.durationMs,
      headers: headerMap,
      body: parsedBody,
      rawBody: response.bodyText
    }
  };
}

function seededStepOutputsFromReport(report: CollectionRunReport | null) {
  if (!report) return {} as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  report.iterations[0]?.stepRuns.forEach(stepRun => {
    if (stepRun.request && stepRun.response) {
      output[stepRun.stepKey] = buildStepOutput(stepRun.request, stepRun.response);
    }
  });
  return output;
}

function resolveCollectionEnvironments(workspace: WorkspaceIndex, collection: CollectionDocument, environmentName?: string) {
  if (environmentName) return [environmentName];
  if (collection.envMatrix.length > 0) return collection.envMatrix;
  return [collection.defaultEnvironment || workspace.project.defaultEnvironment];
}

function shouldRunCollectionStep(input: {
  step: CollectionStep;
  requestRecord: WorkspaceRequestRecord | undefined;
  filters?: CollectionRunFilters;
  explicitStepKeys?: string[];
}) {
  const { step, requestRecord, filters, explicitStepKeys } = input;
  if (!step.enabled) return false;
  if (explicitStepKeys && explicitStepKeys.length > 0 && !explicitStepKeys.includes(step.key)) return false;
  if (!filters) return true;
  if (filters.stepKeys && filters.stepKeys.length > 0 && !filters.stepKeys.includes(step.key)) return false;
  if (filters.requestIds && filters.requestIds.length > 0 && !filters.requestIds.includes(step.requestId)) return false;
  if (filters.caseIds && filters.caseIds.length > 0 && (!step.caseId || !filters.caseIds.includes(step.caseId))) return false;
  if (filters.tags && filters.tags.length > 0) {
    const caseDocument = requestRecord?.cases.find(item => item.id === step.caseId);
    const tags = new Set([...(step.tags || []), ...(requestRecord?.request.tags || []), ...(caseDocument?.tags || [])]);
    if (!filters.tags.some(tag => tags.has(tag))) return false;
  }
  return true;
}

function resolveCollectionRunFilters(collection: CollectionDocument, filters?: CollectionRunFilters): CollectionRunFilters {
  return {
    tags: filters?.tags !== undefined ? filters.tags : collection.runnerTags || [],
    stepKeys: filters?.stepKeys || [],
    requestIds: filters?.requestIds || [],
    caseIds: filters?.caseIds || []
  };
}

function shouldRetryAttempt(
  policy: RetryPolicy | undefined,
  failureType: 'network-error' | 'assertion-failed' | 'blocking-diagnostic',
  response?: SendRequestResult
) {
  if (!policy || policy.count <= 0) return false;
  if (response?.status && response.status >= 500 && policy.when.includes('5xx')) return true;
  if (failureType === 'blocking-diagnostic') return false;
  return policy.when.includes(failureType);
}

function normalizeStepRetry(step: CollectionStep, collection: CollectionDocument, caseDocument?: CaseDocument) {
  const fallback = {
    count: 0,
    delayMs: 0,
    when: ['network-error', '5xx', 'assertion-failed']
  } satisfies RetryPolicy;
  const candidates = [step.retry, caseDocument?.retry, collection.defaultRetry].filter(Boolean) as RetryPolicy[];
  const enabled = candidates.find(policy => policy.count > 0);
  return retryPolicySchema.parse(enabled || step.retry || caseDocument?.retry || collection.defaultRetry || fallback);
}

function responseHeaderValue(response: SendRequestResult, name: string) {
  const lower = name.toLowerCase();
  return response.headers.find(header => header.name.toLowerCase() === lower)?.value || '';
}

function upsertResolvedHeader(headers: ParameterRow[], name: string, value: string) {
  const normalized = name.trim().toLowerCase();
  const next = headers.map(header =>
    header.name.trim().toLowerCase() === normalized
      ? { ...header, name, value, enabled: true, kind: header.kind || 'text' }
      : header
  );
  if (next.some(header => header.name.trim().toLowerCase() === normalized)) return next;
  return [...next, { name, value, enabled: true, kind: 'text', filePath: undefined }];
}

function ntlmHeaderMessageType(value: string) {
  const match = /^NTLM\s+([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) return undefined;
  const bytes = bytesFromBase64(match[1]);
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 8)) !== 'NTLMSSP\0') return undefined;
  return readLittleEndian32(bytes, 8);
}

function splitChallengeParameters(input: string) {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === ',' && !quoted) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseDigestChallenge(header: string) {
  const match = /(?:^|,\s*)Digest\s+/i.exec(header);
  if (!match) return undefined;
  const paramsText = header.slice((match.index || 0) + match[0].length);
  const output: Pick<AuthConfig, 'realm' | 'nonce' | 'qop' | 'opaque' | 'algorithm'> = {};
  splitChallengeParameters(paramsText).forEach(part => {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex === -1) return;
    const key = part.slice(0, equalsIndex).trim().toLowerCase();
    const rawValue = part.slice(equalsIndex + 1).trim();
    const value = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : rawValue;
    if (key === 'realm') output.realm = value;
    if (key === 'nonce') output.nonce = value;
    if (key === 'opaque') output.opaque = value;
    if (key === 'algorithm') output.algorithm = value;
    if (key === 'qop') {
      const qops = value.split(',').map(item => item.trim()).filter(Boolean);
      output.qop = qops.includes('auth') ? 'auth' : qops[0];
    }
  });
  return output.realm && output.nonce ? output : undefined;
}

function mergeDigestChallengeAuth(auth: AuthConfig, challenge: Pick<AuthConfig, 'realm' | 'nonce' | 'qop' | 'opaque' | 'algorithm'>) {
  return authConfigSchema.parse({
    ...auth,
    type: 'digest',
    realm: challenge.realm || auth.realm,
    nonce: challenge.nonce || auth.nonce,
    qop: challenge.qop || auth.qop || 'auth',
    opaque: challenge.opaque || auth.opaque,
    algorithm: challenge.algorithm || auth.algorithm || 'MD5',
    nonceCount: auth.nonceCount || '00000001',
    cnonce: auth.cnonce || createId('cnonce')
  });
}

function applyStepOverrides(request: RequestDocument, caseDocument: CaseDocument | undefined, step: CollectionStep) {
  if (!step.timeoutMs) return { request, caseDocument };
  if (caseDocument) {
    return {
      request,
      caseDocument: caseDocumentSchema.parse({
        ...caseDocument,
        overrides: {
          ...caseDocument.overrides,
          runtime: {
            ...caseDocument.overrides.runtime,
            timeoutMs: step.timeoutMs
          }
        }
      })
    };
  }
  return {
    request: requestDocumentSchema.parse({
      ...request,
      runtime: {
        ...request.runtime,
        timeoutMs: step.timeoutMs
      }
    }),
    caseDocument
  };
}

export async function runPreparedRequest(input: PreparedRequestRunInput): Promise<PreparedRequestRunResult> {
  const kind = effectiveRequestKind(input.request, input.caseDocument);
  const legacyScriptSource = scriptRequestUsesLegacyPreRequestSource(input.request, input.caseDocument);
  const context = input.context || {};
  const envName =
    input.caseDocument?.environment || context.state?.environment.name || input.workspace.project.defaultEnvironment;
  const sourceEnvironment =
    input.workspace.environments.find(item => item.document.name === envName)?.document || createDefaultEnvironment(envName);
  const initialEnvironment =
    context.state?.environment && context.state.environment.name === envName
      ? context.state.environment
      : structuredClone(sourceEnvironment);
  const state = context.state || {
    variables: {},
    environment: initialEnvironment
  };
  state.environment = initialEnvironment;
  const preRequestScript = joinScriptBlocks(
    input.context?.collectionScripts?.preRequest,
    legacyScriptSource ? '' : input.request.scripts.preRequest,
    input.caseDocument?.scripts?.preRequest
  );
  const postResponseScript = joinScriptBlocks(
    input.context?.collectionScripts?.postResponse,
    input.context?.collectionScripts?.tests,
    input.request.scripts.postResponse,
    input.request.scripts.tests,
    input.caseDocument?.scripts?.postResponse
  );
  const scriptContext = {
    iterationData: input.context?.iterationData,
    iteration: input.context?.iteration,
    iterationCount: input.context?.iterationCount,
    requestId: input.request.id,
    caseId: input.caseDocument?.id,
    sourceCollection: input.context?.sourceCollection
  };

  const beforeSources = [
    createNamedTemplateSource('runtime variables', state.variables, 'runtime'),
    ...(context.extraSources || [])
  ];
  const previewBeforeScripts = resolveRequest(
    input.workspace.project,
    input.request,
    input.caseDocument,
    state.environment,
    beforeSources
  );
  const preScript = await executeRequestScript({
    phase: 'pre-request',
    script: preRequestScript,
    state,
    request: previewBeforeScripts,
    context: scriptContext,
    sendRequest: request => input.sendRequest(sendRequestInputSchema.parse({
      ...request,
      sessionId: input.sessionId || previewBeforeScripts.sessionId
    }))
  });
  const runtimeSources = [
    createNamedTemplateSource('runtime variables', preScript.state.variables, 'script'),
    ...(context.extraSources || [])
  ];
  const insight = inspectResolvedRequest(
    input.workspace.project,
    input.request,
    input.caseDocument,
    preScript.state.environment || initialEnvironment,
    runtimeSources
  );
  const blockingDiagnostics = insight.diagnostics.filter(item => item.blocking);
  if (!preScript.execution.skipRequest && blockingDiagnostics.length > 0) {
    throw Object.assign(new Error(blockingDiagnostics.map(item => item.message).join(' ')), {
      failureType: 'blocking-diagnostic' as const
    });
  }

  const preview = resolvedRequestPreviewSchema.parse({
    ...insight.preview,
    sessionId: input.sessionId || input.workspace.root
  });
  if (preScript.execution.skipRequest) {
    return {
      preview,
      response: buildSkippedRunResponse({
        request: input.request,
        preview
      }),
      checkResults: [...preScript.testResults],
      scriptLogs: [...preScript.logs],
      skipped: true,
      execution: preScript.execution,
      state: {
        variables: { ...preScript.state.variables },
        environment: structuredClone(preScript.state.environment || initialEnvironment)
      }
    };
  }
  if (kind === 'script') {
    const mainScript = await executeRequestScript({
      phase: 'pre-request',
      script: scriptRequestSource(input.request, input.caseDocument),
      state: preScript.state,
      request: preview,
      context: scriptContext,
      sendRequest: request => input.sendRequest(sendRequestInputSchema.parse({
        ...request,
        sessionId: input.sessionId || preview.sessionId
      }))
    });
    const scriptExecution = mergeScriptExecutionFlows(preScript.execution, mainScript.execution);
    if (scriptExecution.skipRequest) {
      return {
        preview,
        response: buildSkippedRunResponse({
          request: input.request,
          preview
        }),
        checkResults: [...mainScript.testResults],
        scriptLogs: [...preScript.logs, ...mainScript.logs],
        skipped: true,
        execution: scriptExecution,
        state: {
          variables: { ...mainScript.state.variables },
          environment: structuredClone(mainScript.state.environment || initialEnvironment)
        }
      };
    }
    const response = buildScriptRunResponse({
      request: input.request,
      preview,
      logs: [...preScript.logs, ...mainScript.logs],
      checkResults: mainScript.testResults
    });
    const postScript = await executeRequestScript({
      phase: 'post-response',
      script: postResponseScript,
      state: mainScript.state,
      request: preview,
      response,
      context: scriptContext
    });
    return {
      preview,
      response,
      checkResults: [...mainScript.testResults, ...postScript.testResults],
      scriptLogs: [...preScript.logs, ...mainScript.logs, ...postScript.logs],
      execution: mergeScriptExecutionFlows(scriptExecution, postScript.execution),
      state: {
        variables: { ...postScript.state.variables },
        environment: structuredClone(postScript.state.environment || initialEnvironment)
      }
    };
  }
  let finalPreview = preview;
  let response = await input.sendRequest(preview);
  const { auth: effectiveAuth } = mergeAuth(input.request.auth, input.caseDocument?.overrides.auth, preScript.state.environment || initialEnvironment);
  if (effectiveAuth.type === 'digest' && response.status === 401 && !preview.headers.some(header => header.enabled && header.name.toLowerCase() === 'authorization')) {
    const challenge = parseDigestChallenge(responseHeaderValue(response, 'www-authenticate'));
    if (challenge) {
      const retryAuth = mergeDigestChallengeAuth(effectiveAuth, challenge);
      const retryRequest = input.caseDocument
        ? input.request
        : requestDocumentSchema.parse({
            ...input.request,
            auth: retryAuth
          });
      const retryCaseDocument = input.caseDocument
        ? caseDocumentSchema.parse({
            ...input.caseDocument,
            overrides: {
              ...input.caseDocument.overrides,
              auth: retryAuth
            }
          })
        : undefined;
      const retryInsight = inspectResolvedRequest(
        input.workspace.project,
        retryRequest,
        retryCaseDocument,
        preScript.state.environment || initialEnvironment,
        runtimeSources
      );
      const retryBlockingDiagnostics = retryInsight.diagnostics.filter(item => item.blocking);
      if (retryBlockingDiagnostics.length === 0) {
        finalPreview = resolvedRequestPreviewSchema.parse({
          ...retryInsight.preview,
          sessionId: input.sessionId || input.workspace.root
        });
        response = await input.sendRequest(finalPreview);
      }
    }
  }
  if (
    effectiveAuth.type === 'ntlm' &&
    response.status === 401 &&
    ntlmHeaderMessageType(preview.headers.find(header => header.enabled && header.name.toLowerCase() === 'authorization')?.value || '') === 1
  ) {
    const challenge = parseNtlmChallenge(responseHeaderValue(response, 'www-authenticate'));
    const retryAuth = buildNtlmAuthenticateHeader({
      auth: effectiveAuth,
      challenge,
      project: input.workspace.project,
      environment: preScript.state.environment || initialEnvironment,
      extraSources: runtimeSources
    });
    if (retryAuth.header) {
      finalPreview = resolvedRequestPreviewSchema.parse({
        ...preview,
        headers: upsertResolvedHeader(preview.headers, 'Authorization', retryAuth.header),
        sessionId: input.sessionId || input.workspace.root
      });
      response = await input.sendRequest(finalPreview);
    }
  }
  const builtinChecks = input.caseDocument ? evaluateChecks(response, input.caseDocument.checks || [], { examples: input.request.examples }) : [];
  const collectionChecks = context.collectionRules
    ? applyCollectionRules({
        ...context.collectionRules,
        response
      })
    : [];
  const postScript = await executeRequestScript({
    phase: 'post-response',
    script: postResponseScript,
    state: preScript.state,
    request: finalPreview,
    response,
    context: scriptContext
  });
  const baselineChecks =
    input.caseDocument?.baselineRef
      ? evaluateChecks(response, [
          caseCheckSchema.parse({
            id: createId('check'),
            type: 'snapshot-match',
            label: `Snapshot ${input.caseDocument.baselineRef}`,
            enabled: true,
            path: '',
            expected: input.caseDocument.baselineRef
          })
        ], { examples: input.request.examples })
      : [];

  return {
    preview: finalPreview,
    response,
    checkResults: [...builtinChecks, ...collectionChecks, ...baselineChecks, ...postScript.testResults],
    scriptLogs: [...preScript.logs, ...postScript.logs],
    execution: mergeScriptExecutionFlows(preScript.execution, postScript.execution),
    state: {
      variables: { ...postScript.state.variables },
      environment: structuredClone(postScript.state.environment || initialEnvironment)
    }
  };
}

async function runCollectionStepWithRetry(input: {
  workspace: WorkspaceIndex;
  collection: CollectionDocument;
  step: CollectionStep;
  requestRecord: WorkspaceRequestRecord;
  runtimeState: { variables: Record<string, string>; environment: EnvironmentDocument };
  dataVars: Record<string, unknown>;
  iteration: number;
  iterationCount: number;
  seeded: Record<string, unknown>;
  sendRequest: RuntimeSendRequest;
}) {
  const caseDocument = input.requestRecord.cases.find(item => item.id === input.step.caseId);
  const retry = normalizeStepRetry(input.step, input.collection, caseDocument);
  const attempts: CollectionStepRun['attempts'] = [];
  const folderVariables = workspaceFolderVariableMap(input.workspace, input.requestRecord.folderSegments);
  const extraSources = [
    ...workspaceFolderVariableSources(input.workspace, input.requestRecord.folderSegments),
    createNamedTemplateSource('collection vars', input.collection.vars, 'collection'),
    createNamedTemplateSource('step outputs', { steps: input.seeded }, 'step-output'),
    createNamedTemplateSource('data row', input.dataVars, 'data-row')
  ];

  const skipExpression = interpolateString(input.step.skipIf || caseDocument?.skip.when || '', [
    input.runtimeState.variables,
    input.dataVars as Record<string, unknown>,
    { steps: input.seeded },
    input.runtimeState.environment.vars
  ]);
  if (caseDocument?.skip.enabled || ['true', '1', 'yes'].includes(skipExpression.trim().toLowerCase())) {
    return {
      stepRun: {
        stepKey: input.step.key,
        stepName: input.step.name || input.step.key,
        requestId: input.step.requestId,
        caseId: input.step.caseId,
        ok: false,
        skipped: true,
        checkResults: [],
        scriptLogs: [],
        error: caseDocument?.skip.reason || 'Skipped by condition',
        failureType: 'skipped',
        attempts: []
      } satisfies CollectionStepRun,
      nextState: input.runtimeState
    };
  }

  for (let attempt = 1; attempt <= retry.count + 1; attempt += 1) {
    try {
      const overridden = applyStepOverrides(input.requestRecord.request, caseDocument, input.step);
      const stepVariables = { ...input.runtimeState.variables };
      const injectedFolderKeys = new Map<string, { value: string; previous?: string; hadPrevious: boolean }>();
      Object.entries(folderVariables).forEach(([key, rawValue]) => {
        const nextValue = String(rawValue ?? '');
        const currentValue = stepVariables[key];
        const collectionValue = input.collection.vars[key];
        if (currentValue !== undefined && currentValue !== collectionValue) return;
        injectedFolderKeys.set(key, {
          value: nextValue,
          previous: currentValue,
          hadPrevious: currentValue !== undefined
        });
        stepVariables[key] = nextValue;
      });
      const result = await runPreparedRequest({
        workspace: input.workspace,
        request: overridden.request,
        caseDocument: overridden.caseDocument,
        sendRequest: input.sendRequest,
        sessionId: input.workspace.root,
        context: {
          extraSources,
          iterationData: input.dataVars,
          iteration: input.iteration,
          iterationCount: input.iterationCount,
          state: {
            variables: stepVariables,
            environment: input.runtimeState.environment
          },
          collectionRules: input.collection.rules,
          collectionScripts: input.collection.scripts,
          sourceCollection: {
            id: input.collection.id,
            name: input.collection.name,
            stepKey: input.step.key
          }
        }
      });
      const nextVariables = { ...result.state.variables };
      injectedFolderKeys.forEach((seeded, key) => {
        if (nextVariables[key] !== seeded.value) return;
        if (seeded.hadPrevious) {
          nextVariables[key] = seeded.previous || '';
          return;
        }
        delete nextVariables[key];
      });
      if (result.skipped) {
        return {
          stepRun: {
            stepKey: input.step.key,
            stepName: input.step.name || input.step.key,
            requestId: input.step.requestId,
            caseId: input.step.caseId,
            ok: false,
            skipped: true,
            request: result.preview,
            response: result.response,
            checkResults: result.checkResults,
            scriptLogs: result.scriptLogs,
            error: 'Skipped by pm.execution.skipRequest()',
            failureType: 'skipped',
            baselineName: caseDocument?.baselineRef || undefined,
            attempts: []
          } satisfies CollectionStepRun,
          nextState: {
            variables: nextVariables,
            environment: result.state.environment
          },
          execution: result.execution
        };
      }
      const ok = result.checkResults.every(check => check.ok);
      attempts.push({
        attempt,
        ok,
        response: result.response,
        checkResults: result.checkResults,
        failureType: ok ? undefined : 'assertion-failed'
      });
      if (ok || attempt > retry.count || !shouldRetryAttempt(retry, 'assertion-failed', result.response)) {
        return {
          stepRun: {
            stepKey: input.step.key,
            stepName: input.step.name || input.step.key,
            requestId: input.step.requestId,
            caseId: input.step.caseId,
            ok,
            skipped: false,
            request: result.preview,
            response: result.response,
            checkResults: result.checkResults,
            scriptLogs: result.scriptLogs,
            failureType: ok ? undefined : 'assertion-failed',
            baselineName: caseDocument?.baselineRef || undefined,
            attempts
          } satisfies CollectionStepRun,
          nextState: {
            variables: nextVariables,
            environment: result.state.environment
          },
          output: buildStepOutput(result.preview, result.response),
          execution: result.execution
        };
      }
    } catch (error) {
      const failureType = ((error as { failureType?: 'network-error' | 'blocking-diagnostic' }).failureType || 'network-error');
      attempts.push({
        attempt,
        ok: false,
        checkResults: [],
        error: (error as Error).message || 'Collection step failed',
        failureType
      });
      if (attempt > retry.count || !shouldRetryAttempt(retry, failureType)) {
        return {
          stepRun: {
            stepKey: input.step.key,
            stepName: input.step.name || input.step.key,
            requestId: input.step.requestId,
            caseId: input.step.caseId,
            ok: false,
            skipped: false,
            checkResults: [],
            scriptLogs: [],
            error: (error as Error).message || 'Collection step failed',
            failureType,
            baselineName: caseDocument?.baselineRef || undefined,
            attempts
          } satisfies CollectionStepRun,
          nextState: input.runtimeState
        };
      }
    }

    if (retry.delayMs > 0) {
      await delay(retry.delayMs);
    }
  }

  return {
    stepRun: {
      stepKey: input.step.key,
      stepName: input.step.name || input.step.key,
      requestId: input.step.requestId,
      caseId: input.step.caseId,
      ok: false,
      skipped: false,
      checkResults: [],
      scriptLogs: [],
      error: 'Collection step failed',
      failureType: 'network-error',
      attempts
    } satisfies CollectionStepRun,
    nextState: input.runtimeState
  };
}

function createFlowControlFailure(message: string) {
  return checkResultSchema.parse({
    id: createId('script'),
    label: 'Script flow control',
    ok: false,
    message,
    source: 'script'
  });
}

function resolveNextCollectionStepIndex(input: {
  phases: Array<CollectionStep & { name?: string }>;
  requestRecords: WorkspaceRequestRecord[];
  currentIndex: number;
  target: string | null;
  filters: CollectionRunFilters;
  explicitStepKeys?: string[];
}) {
  if (input.target === null) {
    return { stop: true as const };
  }

  const normalizedTarget = input.target.trim();
  const matchesTarget = (step: CollectionStep & { name?: string }, index: number) => {
    const requestName = input.requestRecords.find(item => item.request.id === step.requestId)?.request.name || '';
    const names = new Set([
      step.key,
      step.key.replace(/^(setup:|teardown:)/, ''),
      step.name || '',
      step.requestId,
      requestName
    ].filter(Boolean));
    return names.has(normalizedTarget) ? index : -1;
  };

  const matchedIndexes = input.phases
    .map((step, index) => {
      const requestRecord = input.requestRecords.find(item => item.request.id === step.requestId);
      if (!requestRecord || !shouldRunCollectionStep({
        step,
        requestRecord,
        filters: input.filters,
        explicitStepKeys: input.explicitStepKeys
      })) {
        return -1;
      }
      return matchesTarget(step, index);
    })
    .filter(index => index >= 0);

  if (matchedIndexes.length === 0) {
    return {
      error: `pm.execution.setNextRequest("${normalizedTarget}") could not find a matching future collection step.`
    };
  }

  const nextIndex = matchedIndexes.find(index => index > input.currentIndex);
  if (nextIndex == null) {
    return {
      error: `pm.execution.setNextRequest("${normalizedTarget}") only supports forward jumps in the local debugger runtime.`
    };
  }

  return { nextIndex };
}

export async function runCollection(input: {
  workspace: WorkspaceIndex;
  collectionId: string;
  sendRequest: RuntimeSendRequest;
  options?: CollectionRunOptions;
}) {
  const record = input.workspace.collections.find(item => item.document.id === input.collectionId);
  if (!record) throw new Error('Collection not found');
  const collection = record.document;
  const effectiveFilters = resolveCollectionRunFilters(collection, input.options?.filters);
  const matrixEnvironments = resolveCollectionEnvironments(input.workspace, collection, input.options?.environmentName);
  const parsedDataRows = parseCollectionDataText(record.dataText || '');
  const baseRows =
    parsedDataRows.length > 0
      ? parsedDataRows
      : Array.from({ length: Math.max(collection.iterationCount || 1, 1) }, () => ({} as Record<string, unknown>));

  const reportIterations: CollectionRunReport['iterations'] = [];
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;

  for (const matrixEnvironment of matrixEnvironments) {
    const sourceEnvironment =
      input.workspace.environments.find(item => item.document.name === matrixEnvironment)?.document || createDefaultEnvironment(matrixEnvironment);
    for (let index = 0; index < baseRows.length; index += 1) {
      const dataVars = baseRows[index] || {};
      let runtimeState = {
        variables: { ...collection.vars },
        environment: structuredClone(sourceEnvironment)
      };
      const seeded = seededStepOutputsFromReport(input.options?.seedReport || null);
      const stepRuns: CollectionStepRun[] = [];
      const phases = [
        ...(collection.setupSteps || []).map(step => ({ ...step, key: `setup:${step.key}`, name: step.name || step.key })),
        ...collection.steps,
        ...(collection.teardownSteps || []).map(step => ({ ...step, key: `teardown:${step.key}`, name: step.name || step.key }))
      ];
      let stop = false;
      let stepIndex = 0;

      while (stepIndex < phases.length) {
        const step = phases[stepIndex];
        const requestRecord = input.workspace.requests.find(item => item.request.id === step.requestId);
        if (!requestRecord || !shouldRunCollectionStep({
          step,
          requestRecord,
          filters: effectiveFilters,
          explicitStepKeys: input.options?.stepKeys
        })) {
          stepIndex += 1;
          continue;
        }
        if (stop) {
          stepRuns.push({
            stepKey: step.key,
            stepName: step.name || step.key,
            requestId: step.requestId,
            caseId: step.caseId,
            ok: false,
            skipped: true,
            checkResults: [],
            scriptLogs: [],
            error: 'Skipped after previous failure',
            failureType: 'skipped',
            attempts: []
          });
          skippedSteps += 1;
          stepIndex += 1;
          continue;
        }

        const executed = await runCollectionStepWithRetry({
          workspace: input.workspace,
          collection,
          step,
          requestRecord,
          runtimeState,
          dataVars,
          iteration: index,
          iterationCount: baseRows.length,
          seeded,
          sendRequest: input.sendRequest
        });
        runtimeState = executed.nextState;
        if (executed.output) {
          seeded[step.key.replace(/^(setup:|teardown:)/, '')] = executed.output;
        }
        if (executed.execution?.nextRequestSet) {
          const nextStepResolution = resolveNextCollectionStepIndex({
            phases,
            requestRecords: input.workspace.requests,
            currentIndex: stepIndex,
            target: executed.execution.nextRequest,
            filters: effectiveFilters,
            explicitStepKeys: input.options?.stepKeys
          });
          if (nextStepResolution.error) {
            const flowFailure = createFlowControlFailure(nextStepResolution.error);
            executed.stepRun.ok = false;
            executed.stepRun.skipped = false;
            executed.stepRun.error = nextStepResolution.error;
            executed.stepRun.failureType = 'assertion-failed';
            executed.stepRun.checkResults = [...executed.stepRun.checkResults, flowFailure];
            const lastAttempt = executed.stepRun.attempts[executed.stepRun.attempts.length - 1];
            if (lastAttempt) {
              lastAttempt.ok = false;
              lastAttempt.failureType = 'assertion-failed';
              lastAttempt.error = nextStepResolution.error;
              lastAttempt.checkResults = [...lastAttempt.checkResults, flowFailure];
            }
          } else if (nextStepResolution.stop) {
            stepRuns.push(executed.stepRun);
            if (executed.stepRun.ok) {
              passedSteps += 1;
            } else if (executed.stepRun.skipped) {
              skippedSteps += 1;
            } else {
              failedSteps += 1;
            }
            break;
          } else {
            stepRuns.push(executed.stepRun);
            if (executed.stepRun.ok) {
              passedSteps += 1;
            } else if (executed.stepRun.skipped) {
              skippedSteps += 1;
            } else {
              failedSteps += 1;
              if (input.options?.failFast || (!step.continueOnFailure && !collection.continueOnFailure && collection.stopOnFailure)) {
                stop = true;
              }
            }
            stepIndex = nextStepResolution.nextIndex!;
            continue;
          }
        }
        stepRuns.push(executed.stepRun);
        if (executed.stepRun.ok) {
          passedSteps += 1;
        } else if (executed.stepRun.skipped) {
          skippedSteps += 1;
        } else {
          failedSteps += 1;
          if (input.options?.failFast || (!step.continueOnFailure && !collection.continueOnFailure && collection.stopOnFailure)) {
            stop = true;
          }
        }
        stepIndex += 1;
      }

      reportIterations.push({
        index,
        dataLabel: baseRows.length > 0 ? `Row ${index + 1}` : undefined,
        dataVars: Object.fromEntries(Object.entries(dataVars).map(([key, value]) => [key, String(value ?? '')])),
        stepRuns,
        environmentName: matrixEnvironment,
        matrixLabel: matrixEnvironment
      });
    }
  }

  return collectionRunReportSchema.parse({
    id: createId('colrun'),
    workspaceRoot: input.workspace.root,
    collectionId: collection.id,
    collectionName: collection.name,
    environmentName: input.options?.environmentName || collection.defaultEnvironment || input.workspace.project.defaultEnvironment,
    status: failedSteps === 0 ? 'passed' : passedSteps > 0 ? 'partial' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    iterationCount: reportIterations.length || 1,
    passedSteps,
    failedSteps,
    skippedSteps,
    iterations: reportIterations,
    matrixEnvironments,
    filters: {
      tags: effectiveFilters.tags || [],
      stepKeys: effectiveFilters.stepKeys?.length ? effectiveFilters.stepKeys : input.options?.stepKeys || [],
      requestIds: effectiveFilters.requestIds || [],
      caseIds: effectiveFilters.caseIds || []
    }
  });
}

export function rerunFailedStepKeys(report: CollectionRunReport) {
  return [...new Set(
    report.iterations
      .flatMap(iteration => iteration.stepRuns)
      .filter(step => !step.ok && !step.skipped && !step.stepKey.startsWith('teardown:'))
      .map(step => step.stepKey.replace(/^(setup:|teardown:)/, ''))
  )];
}

export function filtersFromCollectionReport(report: CollectionRunReport): CollectionRunFilters {
  return {
    tags: [...(report.filters.tags || [])],
    stepKeys: [...(report.filters.stepKeys || [])],
    requestIds: [...(report.filters.requestIds || [])],
    caseIds: [...(report.filters.caseIds || [])]
  };
}

function filterSummary(filters: CollectionRunFilters | undefined) {
  if (!filters) return 'none';
  const parts = [
    filters.tags?.length ? `tags=${filters.tags.join(',')}` : '',
    filters.stepKeys?.length ? `steps=${filters.stepKeys.join(',')}` : '',
    filters.requestIds?.length ? `requests=${filters.requestIds.join(',')}` : '',
    filters.caseIds?.length ? `cases=${filters.caseIds.join(',')}` : ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'none';
}

export function renderCollectionRunReportJunit(report: CollectionRunReport) {
  const testcases = report.iterations.flatMap(iteration =>
    iteration.stepRuns.map(step => {
      const name = `${iteration.matrixLabel || iteration.environmentName || report.environmentName || 'default'} / ${iteration.dataLabel || `Iteration ${iteration.index + 1}`} / ${step.stepName}`;
      const failure = step.ok || step.skipped
        ? ''
        : `<failure message="${escapeHtml(step.error || step.checkResults.find(check => !check.ok)?.message || 'Step failed')}">${escapeHtml(JSON.stringify({
            failureType: step.failureType,
            attempts: step.attempts,
            checks: step.checkResults
          }, null, 2))}</failure>`;
      const skipped = step.skipped ? `<skipped message="${escapeHtml(step.error || 'Skipped')}" />` : '';
      return `<testcase classname="${escapeHtml(report.collectionName)}" name="${escapeHtml(name)}" time="${((step.response?.durationMs || 0) / 1000).toFixed(3)}">${failure}${skipped}</testcase>`;
    })
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapeHtml(report.collectionName)}" tests="${report.iterations.flatMap(item => item.stepRuns).length}" failures="${report.failedSteps}" skipped="${report.skippedSteps}" yapi_filters="${escapeHtml(filterSummary(report.filters))}">
${testcases}
</testsuite>`;
}

export function inferFolderSegmentsFromPath(filePath: string, root: string) {
  const relative = pathSegmentsBetween(`${root}/requests`, filePath);
  return relative.slice(0, -1);
}

export function buildFileContentMap(entries: FileEntry[]) {
  const output: Record<string, string> = {};
  const walk = (items: FileEntry[]) => {
    items.forEach(item => {
      if (item.kind === 'file') {
        output[item.path] = '';
        return;
      }
      if (item.children) {
        walk(item.children);
      }
    });
  };
  walk(entries);
  return output;
}

function parseCsvDataText(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    throw new Error('Collection CSV data must include a header row and at least one data row');
  }

  const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
  return rows.slice(1).map((row, index) => {
    const output: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      output[header] = row[columnIndex] ?? '';
    });
    if (Object.keys(output).length === 0) {
      throw new Error(`Collection data row ${index + 2} is empty`);
    }
    return output;
  });
}

export function inspectCollectionDataText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      format: 'empty' as const,
      rows: [] as Array<Record<string, unknown>>,
      columns: [] as string[]
    };
  }

  let format: 'json' | 'yaml' | 'csv' = 'json';
  let parsed: unknown;
  try {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      parsed = JSON.parse(trimmed);
      format = 'json';
    } else {
      parsed = parseYamlDocument<unknown>(trimmed);
      format = 'yaml';
    }
  } catch (_error) {
    parsed = parseCsvDataText(trimmed);
    format = 'csv';
  }

  if (!Array.isArray(parsed)) {
    if (trimmed.includes(',') || trimmed.includes('\n')) {
      parsed = parseCsvDataText(trimmed);
      format = 'csv';
    } else {
      throw new Error('Collection data file must contain a JSON/YAML array of objects or a CSV table');
    }
  }

  const parsedRows = parsed as unknown[];
  const rows = parsedRows.map((row: unknown, index: number) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Collection data row ${index + 1} must be an object`);
    }
    return row as Record<string, unknown>;
  });

  const columns = [...rows.reduce((set: Set<string>, row: Record<string, unknown>) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>())];

  return { format, rows, columns };
}

export function parseCollectionDataText(text: string) {
  return inspectCollectionDataText(text).rows;
}

function inspectScriptSource(script: string) {
  const trimmed = script.trim();
  if (!trimmed) return [] as Array<{ code: string; level: 'warning' | 'error'; message: string }>;

  const matchedPatterns = UNSUPPORTED_SCRIPT_PATTERNS
    .filter(pattern => trimmed.includes(pattern.token))
    .filter(pattern => !UNSUPPORTED_SCRIPT_PATTERNS.some(other => other !== pattern && trimmed.includes(other.token) && other.token.startsWith(pattern.token)))
  const signals: Array<{ code: string; level: 'warning' | 'error'; message: string }> = matchedPatterns
    .map(pattern => ({
      code: pattern.code,
      level: pattern.level,
      message: pattern.message
    }));

  try {
    // Validate syntax early so the UI can warn before the user sends the request.
    // eslint-disable-next-line no-new-func
    new Function('pm', 'console', trimmed);
  } catch (error) {
    signals.push({
      code: 'script-parse-error',
      level: 'error',
      message: `Script parsing failed: ${(error as Error).message || 'Unknown parser error'}`
    });
  }

  return signals;
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCollectionRunReportHtml(report: CollectionRunReport) {
  const failureRows = report.iterations
    .flatMap(iteration =>
      iteration.stepRuns
        .filter(step => !step.ok || step.skipped)
        .map(step => ({
          iteration: iteration.dataLabel || `Iteration ${iteration.index + 1}`,
          step: step.stepName,
          status: step.skipped ? 'SKIPPED' : 'FAILED',
          detail: step.error || step.checkResults.find(check => !check.ok)?.message || 'No detail available'
        }))
    )
    .slice(0, 50);

  const iterationSections = report.iterations
    .map(iteration => {
      const stepRows = iteration.stepRuns
        .map(step => {
          const attemptCount = step.attempts?.length || 1;
          const summary =
            step.error ||
            step.checkResults.find(check => !check.ok)?.message ||
            `${step.checkResults.length} checks / ${attemptCount} attempt(s)`;
          return `
            <tr>
              <td>${escapeHtml(step.stepName)}</td>
              <td>${escapeHtml(step.stepKey)}</td>
              <td>${escapeHtml(step.skipped ? 'SKIPPED' : step.ok ? 'PASS' : 'FAIL')}</td>
              <td>${escapeHtml(iteration.environmentName || report.environmentName || 'shared')}</td>
              <td>${escapeHtml(String(attemptCount))}</td>
              <td>${escapeHtml(summary)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="iteration">
          <h2>${escapeHtml(iteration.matrixLabel || iteration.environmentName || report.environmentName || 'shared')} · ${escapeHtml(iteration.dataLabel || `Iteration ${iteration.index + 1}`)}</h2>
          <table>
            <thead>
              <tr><th>Step</th><th>Key</th><th>Status</th><th>Env</th><th>Attempts</th><th>Summary</th></tr>
            </thead>
            <tbody>${stepRows}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const failureList = failureRows.length
    ? `
      <section class="summary">
        <h2>Failure Summary</h2>
        <table>
          <thead>
            <tr><th>Iteration</th><th>Step</th><th>Status</th><th>Detail</th></tr>
          </thead>
          <tbody>
            ${failureRows
              .map(
                row => `
                  <tr>
                    <td>${escapeHtml(row.iteration)}</td>
                    <td>${escapeHtml(row.step)}</td>
                    <td>${escapeHtml(row.status)}</td>
                    <td>${escapeHtml(row.detail)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.collectionName)} report</title>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", "PingFang SC", sans-serif; }
      body { margin: 0; padding: 32px; background: #f6f8fb; color: #16212b; }
      h1, h2 { margin: 0 0 12px; }
      h1 { font-size: 28px; }
      h2 { font-size: 18px; margin-top: 28px; }
      .hero, .summary, .iteration { background: #ffffff; border: 1px solid #d7dde6; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
      .meta div { background: #f1f5f9; border-radius: 10px; padding: 12px; }
      .meta span { display: block; font-size: 12px; color: #52606d; margin-bottom: 6px; }
      .meta strong { font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e6ebf2; vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6772; }
      td { font-size: 14px; }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(report.collectionName)}</h1>
      <p>Environment: ${escapeHtml(report.environmentName || 'shared')} · Matrix: ${escapeHtml(report.matrixEnvironments?.join(', ') || 'single')} · Status: ${escapeHtml(report.status)}</p>
      <div class="meta">
        <div><span>Iterations</span><strong>${report.iterationCount}</strong></div>
        <div><span>Passed Steps</span><strong>${report.passedSteps}</strong></div>
        <div><span>Failed Steps</span><strong>${report.failedSteps}</strong></div>
        <div><span>Skipped Steps</span><strong>${report.skippedSteps}</strong></div>
        <div><span>Filters</span><strong>${escapeHtml(filterSummary(report.filters))}</strong></div>
      </div>
    </section>
    ${failureList}
    ${iterationSections}
  </body>
</html>`;
}

export {
  applyCollectionRules,
  buildImportJourneyState,
  buildCurlCommand,
  evaluateChecks,
  evaluateSyncGuard,
  executeRequestScript,
  interpolateString,
  mergeTemplateSources
};
