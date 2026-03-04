import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Modal, Select, Space, Switch, Table, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  UploadOutlined
} from '@ant-design/icons';
import json5 from 'json5';

const { Text } = Typography;
const DRAFT4_SCHEMA_URI = 'http://json-schema.org/draft-04/schema#';
const ROOT_ID = '__root__';

type SchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

type SchemaFieldRow = {
  id: string;
  parentId: string;
  depth: number;
  name: string;
  type: SchemaFieldType;
  required: boolean;
  description: string;
  defaultValue: string;
  mockValue: string;
  isArrayItem: boolean;
};

type SchemaVisualEditorProps = {
  value?: string;
  onChange: (nextValue: string) => void;
};

const FIELD_TYPES: Array<{ label: string; value: SchemaFieldType }> = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'integer', value: 'integer' },
  { label: 'boolean', value: 'boolean' },
  { label: 'array', value: 'array' },
  { label: 'object', value: 'object' },
  { label: 'null', value: 'null' }
];

function createId(seed?: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${seed || ''}`;
}

function toObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function resolveNodeType(record: Record<string, unknown>): SchemaFieldType {
  const rawType = String(record.type || '').toLowerCase();
  if (FIELD_TYPES.some(item => item.value === rawType)) {
    return rawType as SchemaFieldType;
  }
  if (record.properties && typeof record.properties === 'object') return 'object';
  if (record.items && typeof record.items === 'object') return 'array';
  return 'string';
}

function normalizeNodeSchema(input: unknown): Record<string, unknown> | null {
  const node = toObject(input);
  if (Object.keys(node).length === 0) return null;
  const next = { ...node };
  if (!next.type && next.properties && typeof next.properties === 'object') {
    next.type = 'object';
  }
  if (!next.type && next.items && typeof next.items === 'object') {
    next.type = 'array';
  }
  if (!next.type) {
    next.type = 'string';
  }
  const type = String(next.type || '').toLowerCase();
  if (!FIELD_TYPES.some(item => item.value === type)) return null;
  next.type = type;
  return next;
}

function parseMaybeJson(input: string): unknown {
  const text = String(input || '').trim();
  if (!text) return undefined;
  try {
    return json5.parse(text);
  } catch (_err) {
    return text;
  }
}

function inferPrimitiveSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: 'string' };
}

function mergeInferredSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  if (schemas.length === 0) return { type: 'string' };
  if (schemas.length === 1) return schemas[0];

  const typeList = schemas.map(schema => String(schema.type || 'string').toLowerCase());
  const uniqueTypes = Array.from(new Set(typeList));
  if (uniqueTypes.length > 1) {
    if (uniqueTypes.length === 2 && uniqueTypes.includes('null')) {
      const nonNull = schemas.find(schema => String(schema.type || '') !== 'null');
      return nonNull || { type: 'string' };
    }
    return schemas[0];
  }

  const type = uniqueTypes[0];
  if (type === 'object') {
    const objectSchemas = schemas.map(schema => toObject(schema));
    const keySet = new Set<string>();
    objectSchemas.forEach(schema => {
      Object.keys(toObject(schema.properties)).forEach(key => keySet.add(key));
    });

    const properties: Record<string, unknown> = {};
    Array.from(keySet).forEach(key => {
      const childSchemas = objectSchemas
        .map(schema => toObject(toObject(schema.properties)[key]))
        .filter(schema => Object.keys(schema).length > 0);
      properties[key] = mergeInferredSchemas(childSchemas);
    });

    const required = Array.from(keySet).filter(key =>
      objectSchemas.every(schema => Object.prototype.hasOwnProperty.call(toObject(schema.properties), key))
    );
    const merged: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) merged.required = required;
    return merged;
  }

  if (type === 'array') {
    const itemSchemas = schemas
      .map(schema => toObject(schema.items))
      .filter(item => Object.keys(item).length > 0);
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }

  return { type };
}

function inferSchemaFromJsonValue(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const itemSchemas = value.map(item => inferSchemaFromJsonValue(item));
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const keys = Object.keys(obj);
    keys.forEach(key => {
      properties[key] = inferSchemaFromJsonValue(obj[key]);
    });
    const schema: Record<string, unknown> = { type: 'object', properties };
    if (keys.length > 0) schema.required = keys;
    return schema;
  }

  return inferPrimitiveSchema(value);
}

function buildSchemaFromPlainJsonText(input: string): string {
  const parsed = json5.parse(String(input || ''));
  const inferred = inferSchemaFromJsonValue(parsed);
  const rootSchema =
    String(inferred.type || '') === 'object'
      ? inferred
      : {
          type: 'object',
          properties: { data: inferred },
          required: ['data']
        };

  return JSON.stringify(
    {
      $schema: DRAFT4_SCHEMA_URI,
      ...rootSchema
    },
    null,
    2
  );
}

function nodeToRows(params: {
  node: Record<string, unknown>;
  name: string;
  parentId: string;
  depth: number;
  required: boolean;
  isArrayItem: boolean;
  rows: SchemaFieldRow[];
}) {
  const { node, name, parentId, depth, required, isArrayItem, rows } = params;
  const type = resolveNodeType(node);
  const rowId = createId(name || 'field');
  const mockRaw =
    node.mock && typeof node.mock === 'object' && !Array.isArray(node.mock)
      ? String((node.mock as Record<string, unknown>).mock || '')
      : String(node.mock || '');

  rows.push({
    id: rowId,
    parentId,
    depth,
    name,
    type,
    required,
    description: String(node.description || node.title || ''),
    defaultValue: typeof node.default === 'undefined' ? '' : JSON.stringify(node.default),
    mockValue: mockRaw,
    isArrayItem
  });

  if (type === 'object') {
    const properties = toObject(node.properties);
    const requiredSet = new Set(
      Array.isArray(node.required) ? node.required.map(item => String(item)) : []
    );
    Object.entries(properties).forEach(([childName, childNode]) => {
      nodeToRows({
        node: toObject(childNode),
        name: childName,
        parentId: rowId,
        depth: depth + 1,
        required: requiredSet.has(childName),
        isArrayItem: false,
        rows
      });
    });
  }

  if (type === 'array') {
    const itemNode = toObject(node.items);
    if (Object.keys(itemNode).length > 0) {
      nodeToRows({
        node: itemNode,
        name: 'items',
        parentId: rowId,
        depth: depth + 1,
        required: false,
        isArrayItem: true,
        rows
      });
    }
  }
}

function parseSchemaRows(schemaText?: string): { rows: SchemaFieldRow[]; rootMeta: Record<string, unknown>; error: string } {
  const text = String(schemaText || '').trim();
  if (!text) return { rows: [], rootMeta: { $schema: DRAFT4_SCHEMA_URI }, error: '' };
  try {
    const raw = json5.parse(text) as Record<string, unknown>;
    const schema = toObject(raw);
    const rootMeta = { ...schema };
    delete rootMeta.type;
    delete rootMeta.properties;
    delete rootMeta.required;
    if (!rootMeta.$schema) {
      rootMeta.$schema = DRAFT4_SCHEMA_URI;
    }

    const rootType = resolveNodeType(schema);
    const rootRows: SchemaFieldRow[] = [];

    if (rootType === 'object') {
      const properties = toObject(schema.properties);
      const requiredSet = new Set(
        Array.isArray(schema.required) ? schema.required.map(item => String(item)) : []
      );
      Object.entries(properties).forEach(([name, node]) => {
        nodeToRows({
          node: toObject(node),
          name,
          parentId: ROOT_ID,
          depth: 0,
          required: requiredSet.has(name),
          isArrayItem: false,
          rows: rootRows
        });
      });
      return { rows: rootRows, rootMeta, error: '' };
    }

    nodeToRows({
      node: schema,
      name: 'data',
      parentId: ROOT_ID,
      depth: 0,
      required: false,
      isArrayItem: false,
      rows: rootRows
    });

    return { rows: rootRows, rootMeta, error: '' };
  } catch (err) {
    return { rows: [], rootMeta: {}, error: String((err as Error).message || 'schema 解析失败') };
  }
}

function buildChildrenMap(rows: SchemaFieldRow[]): Map<string, SchemaFieldRow[]> {
  const map = new Map<string, SchemaFieldRow[]>();
  rows.forEach(row => {
    const list = map.get(row.parentId) || [];
    list.push(row);
    map.set(row.parentId, list);
  });
  return map;
}

function buildNodeFromRow(row: SchemaFieldRow, childrenMap: Map<string, SchemaFieldRow[]>): Record<string, unknown> {
  const node: Record<string, unknown> = { type: row.type };

  if (String(row.description || '').trim()) {
    node.description = String(row.description || '').trim();
  }

  if (String(row.defaultValue || '').trim()) {
    const parsedDefault = parseMaybeJson(row.defaultValue);
    if (typeof parsedDefault !== 'undefined') {
      node.default = parsedDefault;
    }
  }

  if (String(row.mockValue || '').trim()) {
    node.mock = { mock: String(row.mockValue || '').trim() };
  }

  const children = childrenMap.get(row.id) || [];

  if (row.type === 'object') {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    children
      .filter(child => !child.isArrayItem)
      .forEach(child => {
        const name = String(child.name || '').trim();
        if (!name) return;
        properties[name] = buildNodeFromRow(child, childrenMap);
        if (child.required) required.push(name);
      });
    node.properties = properties;
    if (required.length > 0) {
      node.required = required;
    }
  }

  if (row.type === 'array') {
    const itemRow = children.find(child => child.isArrayItem) || null;
    node.items = itemRow ? buildNodeFromRow(itemRow, childrenMap) : { type: 'string' };
  }

  return node;
}

function rowsToSchemaText(rows: SchemaFieldRow[], rootMeta?: Record<string, unknown>): string {
  const childrenMap = buildChildrenMap(rows);
  const topRows = (childrenMap.get(ROOT_ID) || []).filter(row => !row.isArrayItem);
  const rootProperties: Record<string, unknown> = {};
  const rootRequired: string[] = [];

  topRows.forEach(row => {
    const name = String(row.name || '').trim();
    if (!name) return;
    rootProperties[name] = buildNodeFromRow(row, childrenMap);
    if (row.required) rootRequired.push(name);
  });

  const schema: Record<string, unknown> = {
    ...(rootMeta || {}),
    type: 'object',
    properties: rootProperties
  };

  if (rootRequired.length > 0) {
    schema.required = rootRequired;
  } else {
    delete schema.required;
  }

  if (!schema.$schema) {
    schema.$schema = DRAFT4_SCHEMA_URI;
  }

  return JSON.stringify(schema, null, 2);
}

function findRowIndex(rows: SchemaFieldRow[], id: string): number {
  return rows.findIndex(item => item.id === id);
}

function getSubtreeEnd(rows: SchemaFieldRow[], index: number): number {
  if (index < 0 || index >= rows.length) return index;
  const depth = rows[index].depth;
  let end = index + 1;
  while (end < rows.length && rows[end].depth > depth) {
    end += 1;
  }
  return end;
}

function getSubtreeIds(rows: SchemaFieldRow[], index: number): string[] {
  const end = getSubtreeEnd(rows, index);
  return rows.slice(index, end).map(item => item.id);
}

function getParentRow(rows: SchemaFieldRow[], row: SchemaFieldRow): SchemaFieldRow | null {
  if (row.parentId === ROOT_ID) return null;
  return rows.find(item => item.id === row.parentId) || null;
}

function isRequiredEditable(rows: SchemaFieldRow[], row: SchemaFieldRow): boolean {
  if (row.isArrayItem) return false;
  if (row.parentId === ROOT_ID) return true;
  const parent = getParentRow(rows, row);
  if (!parent) return false;
  return parent.type === 'object';
}

function createEmptyRow(params: {
  parentId: string;
  depth: number;
  isArrayItem?: boolean;
  type?: SchemaFieldType;
}): SchemaFieldRow {
  const isArrayItem = params.isArrayItem === true;
  return {
    id: createId('new'),
    parentId: params.parentId,
    depth: params.depth,
    name: isArrayItem ? 'items' : '',
    type: params.type || 'string',
    required: false,
    description: '',
    defaultValue: '',
    mockValue: '',
    isArrayItem
  };
}

export function SchemaVisualEditor(props: SchemaVisualEditorProps) {
  const initialParsed = useMemo(() => parseSchemaRows(props.value), []);
  const [rows, setRows] = useState<SchemaFieldRow[]>(initialParsed.rows);
  const [rootMeta, setRootMeta] = useState<Record<string, unknown>>(initialParsed.rootMeta);
  const [parseError, setParseError] = useState<string>(initialParsed.error);
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState('');
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldDraft, setFieldDraft] = useState('');
  const [fieldEditingRowId, setFieldEditingRowId] = useState('');
  const [importJsonModalOpen, setImportJsonModalOpen] = useState(false);
  const [importJsonDraft, setImportJsonDraft] = useState('');

  const lastEmittedSchemaRef = useRef<string | null>(null);
  const rootMetaRef = useRef(rootMeta);

  useEffect(() => {
    rootMetaRef.current = rootMeta;
  }, [rootMeta]);

  useEffect(() => {
    const nextText = String(props.value || '').trim();
    if (lastEmittedSchemaRef.current !== null && nextText === lastEmittedSchemaRef.current) {
      return;
    }
    const parsed = parseSchemaRows(props.value);
    setRows(parsed.rows);
    setRootMeta(parsed.rootMeta);
    setParseError(parsed.error);
    setCollapsedIds(new Set());
    setRootCollapsed(false);
  }, [props.value]);

  const childrenMap = useMemo(() => buildChildrenMap(rows), [rows]);

  const visibleRows = useMemo(() => {
    if (rootCollapsed) return [];
    const idMap = new Map(rows.map(item => [item.id, item]));
    return rows.filter(row => {
      let parentId = row.parentId;
      while (parentId !== ROOT_ID) {
        if (collapsedIds.has(parentId)) return false;
        const parent = idMap.get(parentId);
        if (!parent) break;
        parentId = parent.parentId;
      }
      return true;
    });
  }, [collapsedIds, rootCollapsed, rows]);

  function emitRows(nextRows: SchemaFieldRow[], nextRootMeta?: Record<string, unknown>) {
    const safeRootMeta = nextRootMeta || rootMetaRef.current;
    setRows(nextRows);
    setParseError('');
    const nextSchemaText = rowsToSchemaText(nextRows, safeRootMeta);
    lastEmittedSchemaRef.current = nextSchemaText;
    props.onChange(nextSchemaText);
  }

  function addTopRow() {
    const nextRows = [...rows, createEmptyRow({ parentId: ROOT_ID, depth: 0 })];
    emitRows(nextRows);
  }

  function addChildRow(targetId: string) {
    const index = findRowIndex(rows, targetId);
    if (index < 0) return;
    const target = rows[index];

    if (target.type === 'object') {
      const insertAt = getSubtreeEnd(rows, index);
      const child = createEmptyRow({ parentId: target.id, depth: target.depth + 1 });
      emitRows([...rows.slice(0, insertAt), child, ...rows.slice(insertAt)]);
      return;
    }

    if (target.type === 'array') {
      const subtreeEnd = getSubtreeEnd(rows, index);
      const directChildren = rows.slice(index + 1, subtreeEnd).filter(item => item.parentId === target.id);
      let itemRow = directChildren.find(item => item.isArrayItem) || null;
      let nextRows = [...rows];

      if (!itemRow) {
        const arrayItem = createEmptyRow({
          parentId: target.id,
          depth: target.depth + 1,
          isArrayItem: true,
          type: 'object'
        });
        const insertAt = getSubtreeEnd(nextRows, index);
        nextRows = [...nextRows.slice(0, insertAt), arrayItem, ...nextRows.slice(insertAt)];
        itemRow = arrayItem;
      } else if (itemRow.type !== 'object') {
        const itemIndex = findRowIndex(nextRows, itemRow.id);
        if (itemIndex >= 0) {
          const itemEnd = getSubtreeEnd(nextRows, itemIndex);
          const replaced: SchemaFieldRow = { ...nextRows[itemIndex], type: 'object' };
          nextRows = [...nextRows.slice(0, itemIndex), replaced, ...nextRows.slice(itemEnd)];
          itemRow = replaced;
        }
      }

      const itemIndex = findRowIndex(nextRows, itemRow.id);
      if (itemIndex < 0) return;
      const insertAt = getSubtreeEnd(nextRows, itemIndex);
      const child = createEmptyRow({ parentId: itemRow.id, depth: itemRow.depth + 1 });
      emitRows([...nextRows.slice(0, insertAt), child, ...nextRows.slice(insertAt)]);
    }
  }

  function patchRow(rowId: string, patch: Partial<SchemaFieldRow>) {
    const index = findRowIndex(rows, rowId);
    if (index < 0) return;
    const current = rows[index];
    const changedType = patch.type && patch.type !== current.type;

    if (!changedType) {
      const nextRows = rows.map(item => (item.id === rowId ? { ...item, ...patch } : item));
      emitRows(nextRows);
      return;
    }

    let nextRows = [...rows];
    const end = getSubtreeEnd(nextRows, index);
    const updatedRow: SchemaFieldRow = { ...nextRows[index], ...patch };
    nextRows = [...nextRows.slice(0, index), updatedRow, ...nextRows.slice(end)];

    if (updatedRow.type === 'array') {
      const arrayItem = createEmptyRow({
        parentId: updatedRow.id,
        depth: updatedRow.depth + 1,
        isArrayItem: true,
        type: 'string'
      });
      nextRows = [...nextRows.slice(0, index + 1), arrayItem, ...nextRows.slice(index + 1)];
    }

    if (updatedRow.type === 'null') {
      nextRows = nextRows.map(item => (item.id === updatedRow.id ? { ...item, defaultValue: '' } : item));
    }

    emitRows(nextRows);
  }

  function removeRow(rowId: string) {
    const index = findRowIndex(rows, rowId);
    if (index < 0) return;
    const removeIds = new Set(getSubtreeIds(rows, index));
    const end = getSubtreeEnd(rows, index);
    const nextRows = [...rows.slice(0, index), ...rows.slice(end)];
    setCollapsedIds(prev => new Set([...prev].filter(id => !removeIds.has(id))));
    emitRows(nextRows);
  }

  function toggleRowCollapse(rowId: string) {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function openSchemaModal() {
    setSchemaDraft(rowsToSchemaText(rows, rootMeta));
    setSchemaModalOpen(true);
  }

  function saveSchemaModal() {
    const parsed = parseSchemaRows(schemaDraft);
    if (parsed.error) {
      message.error(`Schema 解析失败: ${parsed.error}`);
      return;
    }
    setSchemaModalOpen(false);
    setRows(parsed.rows);
    setRootMeta(parsed.rootMeta);
    setParseError('');
    setCollapsedIds(new Set());
    setRootCollapsed(false);
    const nextText = rowsToSchemaText(parsed.rows, parsed.rootMeta);
    lastEmittedSchemaRef.current = nextText;
    props.onChange(nextText);
  }

  function openFieldModal(rowId: string) {
    const row = rows.find(item => item.id === rowId);
    if (!row) return;
    const node = buildNodeFromRow(row, childrenMap);
    setFieldEditingRowId(rowId);
    setFieldDraft(JSON.stringify(node, null, 2));
    setFieldModalOpen(true);
  }

  function saveFieldModal() {
    const rowId = fieldEditingRowId;
    if (!rowId) return;
    const rowIndex = findRowIndex(rows, rowId);
    if (rowIndex < 0) return;

    try {
      const parsed = json5.parse(fieldDraft);
      const node = normalizeNodeSchema(parsed);
      if (!node) {
        message.error('字段 schema 格式无效');
        return;
      }

      const oldRow = rows[rowIndex];
      const replacementRows: SchemaFieldRow[] = [];
      nodeToRows({
        node,
        name: oldRow.name,
        parentId: oldRow.parentId,
        depth: oldRow.depth,
        required: oldRow.required,
        isArrayItem: oldRow.isArrayItem,
        rows: replacementRows
      });

      const end = getSubtreeEnd(rows, rowIndex);
      const removedIds = new Set(getSubtreeIds(rows, rowIndex));
      const nextRows = [...rows.slice(0, rowIndex), ...replacementRows, ...rows.slice(end)];
      setCollapsedIds(prev => new Set([...prev].filter(id => !removedIds.has(id))));
      emitRows(nextRows);
      setFieldModalOpen(false);
      setFieldEditingRowId('');
    } catch (error) {
      message.error(`字段 schema 解析失败: ${String((error as Error).message || error)}`);
    }
  }

  function openImportJsonModal() {
    setImportJsonDraft('');
    setImportJsonModalOpen(true);
  }

  function saveImportJsonModal() {
    try {
      const schemaText = buildSchemaFromPlainJsonText(importJsonDraft);
      const parsed = parseSchemaRows(schemaText);
      if (parsed.error) {
        message.error(`导入失败: ${parsed.error}`);
        return;
      }
      setImportJsonModalOpen(false);
      setRows(parsed.rows);
      setRootMeta(parsed.rootMeta);
      setParseError('');
      setCollapsedIds(new Set());
      setRootCollapsed(false);
      lastEmittedSchemaRef.current = schemaText;
      props.onChange(schemaText);
    } catch (error) {
      message.error(`JSON 解析失败: ${String((error as Error).message || error)}`);
    }
  }

  const columns: ColumnsType<SchemaFieldRow> = [
    {
      title: '字段名',
      dataIndex: 'name',
      width: 260,
      render: (_, row) => {
        const hasChildren = (childrenMap.get(row.id) || []).length > 0;
        const expanded = !collapsedIds.has(row.id);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: row.depth * 18 }}>
            <Button
              type="text"
              size="small"
              style={{ width: 20, height: 20, padding: 0 }}
              icon={hasChildren ? (expanded ? <DownOutlined /> : <RightOutlined />) : <span />}
              onClick={() => hasChildren && toggleRowCollapse(row.id)}
            />
            <Input
              value={row.isArrayItem ? 'items' : row.name}
              onChange={event => patchRow(row.id, { name: event.target.value })}
              placeholder={row.isArrayItem ? 'items' : 'name'}
              disabled={row.isArrayItem}
            />
          </div>
        );
      }
    },
    {
      title: '必填',
      dataIndex: 'required',
      width: 88,
      render: (_, row) => (
        <Switch
          size="small"
          checked={row.required}
          disabled={!isRequiredEditable(rows, row)}
          onChange={checked => patchRow(row.id, { required: checked })}
        />
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 140,
      render: (_, row) => (
        <Select<SchemaFieldType>
          value={row.type}
          style={{ width: '100%' }}
          options={FIELD_TYPES}
          onChange={value => patchRow(row.id, { type: value })}
        />
      )
    },
    {
      title: 'mock',
      dataIndex: 'mockValue',
      width: 180,
      render: (_, row) => (
        <Input
          value={row.mockValue}
          onChange={event => patchRow(row.id, { mockValue: event.target.value })}
          placeholder="mock"
        />
      )
    },
    {
      title: 'description',
      dataIndex: 'description',
      width: 220,
      render: (_, row) => (
        <Input
          value={row.description}
          onChange={event => patchRow(row.id, { description: event.target.value })}
          placeholder="备注"
        />
      )
    },
    {
      title: '操作',
      width: 150,
      render: (_, row) => (
        <Space size={0}>
          <Tooltip title="查看字段 Schema">
            <Button type="text" icon={<SettingOutlined />} onClick={() => openFieldModal(row.id)} />
          </Tooltip>
          {row.type === 'object' || row.type === 'array' ? (
            <Tooltip title="添加子节点">
              <Button type="text" icon={<PlusOutlined />} onClick={() => addChildRow(row.id)} />
            </Tooltip>
          ) : null}
          <Tooltip title="删除字段">
            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(row.id)} />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 88px 140px 180px 220px auto',
          gap: 8,
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            type="text"
            size="small"
            style={{ width: 20, height: 20, padding: 0 }}
            icon={rootCollapsed ? <RightOutlined /> : <DownOutlined />}
            onClick={() => setRootCollapsed(value => !value)}
          />
          <Input value="root" readOnly />
        </div>
        <Switch size="small" checked={false} disabled />
        <Select value="object" disabled options={[{ value: 'object', label: 'object' }]} />
        <Input value="mock" disabled />
        <Input value="description" disabled />
        <Space size={0}>
          <Tooltip title="导入 JSON 生成 Schema">
            <Button type="text" icon={<UploadOutlined />} onClick={openImportJsonModal} />
          </Tooltip>
          <Tooltip title="查看/编辑 Schema 文件">
            <Button type="text" icon={<FileTextOutlined />} onClick={openSchemaModal} />
          </Tooltip>
          <Tooltip title="添加子节点">
            <Button type="text" icon={<PlusOutlined />} onClick={addTopRow} />
          </Tooltip>
        </Space>
      </div>

      {parseError ? <Text type="danger">当前 schema 解析失败: {parseError}</Text> : null}

      <Table<SchemaFieldRow>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={visibleRows}
        locale={{
          emptyText: (
            <Empty
              description="暂无字段，点击 root 行右侧 + 添加子节点"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )
        }}
      />

      <Modal
        title="Schema 文件编辑"
        open={schemaModalOpen}
        onCancel={() => setSchemaModalOpen(false)}
        onOk={saveSchemaModal}
        width={900}
        okText="应用"
      >
        <Input.TextArea rows={20} value={schemaDraft} onChange={event => setSchemaDraft(event.target.value)} />
      </Modal>

      <Modal
        title="字段 Schema"
        open={fieldModalOpen}
        onCancel={() => setFieldModalOpen(false)}
        onOk={saveFieldModal}
        width={720}
        okText="应用"
      >
        <Input.TextArea rows={16} value={fieldDraft} onChange={event => setFieldDraft(event.target.value)} />
      </Modal>

      <Modal
        title="导入 JSON 并生成 Schema"
        open={importJsonModalOpen}
        onCancel={() => setImportJsonModalOpen(false)}
        onOk={saveImportJsonModal}
        width={760}
        okText="生成并应用"
      >
        <Text type="secondary">粘贴正常 JSON（示例数据），将自动转换为 JSON Schema。</Text>
        <Input.TextArea
          rows={14}
          style={{ marginTop: 12 }}
          value={importJsonDraft}
          onChange={event => setImportJsonDraft(event.target.value)}
          placeholder='{\n  "code": 0,\n  "message": "ok",\n  "data": { "records": [] }\n}'
        />
      </Modal>
    </Space>
  );
}
