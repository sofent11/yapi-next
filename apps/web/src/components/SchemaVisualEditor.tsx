import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconSettings,
  IconTrash
} from '@tabler/icons-react';
import json5 from 'json5';

import type { SchemaFieldRow, SchemaVisualEditorProps } from './SchemaVisualEditor.types';
import {
  ROOT_ID,
  buildChildrenMap,
  buildNodeFromRow,
  buildSchemaFromPlainJsonText,
  createEmptyRow,
  findRowIndex,
  getSubtreeEnd,
  getSubtreeIds,
  isRequiredEditable,
  nodeToRows,
  normalizeNodeSchema,
  parseSchemaRows,
  rowsToSchemaText
} from './SchemaVisualEditor.utils';

import { SchemaSourceModal } from './schema-visual-editor/SchemaSourceModal';
import { FieldSchemaModal } from './schema-visual-editor/FieldSchemaModal';
import { ImportJsonModal } from './schema-visual-editor/ImportJsonModal';
import { SchemaEditorHeader } from './schema-visual-editor/SchemaEditorHeader';
import { TypeSelector } from './schema-visual-editor/TypeSelector';
import { MockGenerator } from './schema-visual-editor/MockGenerator';
import { PropertyEditor } from './schema-visual-editor/PropertyEditor';

function showError(message: string) {
  notifications.show({ color: 'red', message });
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
      showError(`Schema 解析失败: ${parsed.error}`);
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
        showError('字段 schema 格式无效');
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
      showError(`字段 schema 解析失败: ${String((error as Error).message || error)}`);
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
        showError(`导入失败: ${parsed.error}`);
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
      showError(`JSON 解析失败: ${String((error as Error).message || error)}`);
    }
  }

  return (
    <div className="legacy-workspace-stack legacy-schema-editor space-y-4">
      <SchemaEditorHeader
        rootCollapsed={rootCollapsed}
        onToggleRootCollapse={() => setRootCollapsed(value => !value)}
        onImportJson={openImportJsonModal}
        onOpenSchema={openSchemaModal}
        onAddTopRow={addTopRow}
      />

      {parseError ? <Text c="red">当前 schema 解析失败: {parseError}</Text> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="w-[260px]">字段名</Table.Th>
              <Table.Th className="w-[88px]">必填</Table.Th>
              <Table.Th className="w-[140px]">类型</Table.Th>
              <Table.Th className="w-[180px]">mock</Table.Th>
              <Table.Th className="w-[220px]">description</Table.Th>
              <Table.Th className="w-[150px]">操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <div className="py-10 text-center text-sm text-slate-500">
                    暂无字段，点击 root 行右侧 + 添加子节点
                  </div>
                </Table.Td>
              </Table.Tr>
            ) : (
              visibleRows.map(row => {
                const hasChildren = (childrenMap.get(row.id) || []).length > 0;
                const expanded = !collapsedIds.has(row.id);
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <div className="legacy-schema-editor-tree-row flex items-center gap-2" style={{ paddingLeft: row.depth * 18 }}>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          className="legacy-schema-editor-toggle-btn"
                          onClick={() => hasChildren && toggleRowCollapse(row.id)}
                          disabled={!hasChildren}
                        >
                          {hasChildren ? (
                            expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />
                          ) : (
                            <span className="block h-4 w-4" />
                          )}
                        </ActionIcon>
                        <TextInput
                          value={row.isArrayItem ? 'items' : row.name}
                          onChange={event => patchRow(row.id, { name: event.currentTarget.value })}
                          placeholder={row.isArrayItem ? 'items' : 'name'}
                          disabled={row.isArrayItem}
                        />
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        size="sm"
                        checked={row.required}
                        disabled={!isRequiredEditable(rows, row)}
                        onChange={event => patchRow(row.id, { required: event.currentTarget.checked })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TypeSelector value={row.type} onChange={value => patchRow(row.id, { type: value })} />
                    </Table.Td>
                    <Table.Td>
                      <MockGenerator value={row.mockValue} onChange={value => patchRow(row.id, { mockValue: value })} />
                    </Table.Td>
                    <Table.Td>
                      <PropertyEditor
                        value={row.description}
                        onChange={value => patchRow(row.id, { description: value })}
                        placeholder="备注"
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="flex items-center gap-1">
                        <Tooltip label="查看字段 Schema">
                          <ActionIcon variant="subtle" onClick={() => openFieldModal(row.id)}>
                            <IconSettings size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {row.type === 'object' || row.type === 'array' ? (
                          <Tooltip label="添加子节点">
                            <ActionIcon variant="subtle" onClick={() => addChildRow(row.id)}>
                              <IconPlus size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        <Tooltip label="删除字段">
                          <ActionIcon color="red" variant="subtle" onClick={() => removeRow(row.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </div>

      <SchemaSourceModal
        open={schemaModalOpen}
        draft={schemaDraft}
        onChange={setSchemaDraft}
        onCancel={() => setSchemaModalOpen(false)}
        onSave={saveSchemaModal}
      />

      <FieldSchemaModal
        open={fieldModalOpen}
        draft={fieldDraft}
        onChange={setFieldDraft}
        onCancel={() => setFieldModalOpen(false)}
        onSave={saveFieldModal}
      />

      <ImportJsonModal
        open={importJsonModalOpen}
        draft={importJsonDraft}
        onChange={setImportJsonDraft}
        onCancel={() => setImportJsonModalOpen(false)}
        onSave={saveImportJsonModal}
      />
    </div>
  );
}
