import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
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

import type { SchemaDefinitionDraft, SchemaFieldRow, SchemaVisualEditorProps } from './SchemaVisualEditor.types';
import {
  ROOT_ID,
  buildChildrenMap,
  buildNodeFromRow,
  buildSchemaFromPlainJsonText,
  createEmptyRow,
  findRowIndex,
  getParentRow,
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

function buildDefinitionOptions(definitions: SchemaDefinitionDraft[]) {
  return definitions.map(item => ({
    value: item.name,
    label: item.name
  }));
}

export function SchemaVisualEditor(props: SchemaVisualEditorProps) {
  const initialParsed = useMemo(() => parseSchemaRows(props.value), []);
  const [rows, setRows] = useState<SchemaFieldRow[]>(initialParsed.rows);
  const [rootMeta, setRootMeta] = useState<Record<string, unknown>>(initialParsed.rootMeta);
  const [definitions, setDefinitions] = useState<SchemaDefinitionDraft[]>(initialParsed.definitions);
  const [parseError, setParseError] = useState<string>(initialParsed.error);
  const [unsupportedKeywords, setUnsupportedKeywords] = useState<string[]>(initialParsed.unsupportedKeywords);
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState('');
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldDraft, setFieldDraft] = useState('');
  const [fieldEditingRowId, setFieldEditingRowId] = useState('');
  const [importJsonModalOpen, setImportJsonModalOpen] = useState(false);
  const [importJsonDraft, setImportJsonDraft] = useState('');
  const [definitionModalOpen, setDefinitionModalOpen] = useState(false);
  const [definitionNameDraft, setDefinitionNameDraft] = useState('');
  const [definitionSchemaDraft, setDefinitionSchemaDraft] = useState('');
  const [definitionEditingName, setDefinitionEditingName] = useState('');
  const [extractingRowId, setExtractingRowId] = useState('');

  const lastEmittedSchemaRef = useRef<string | null>(null);
  const rootMetaRef = useRef(rootMeta);
  const definitionsRef = useRef(definitions);

  useEffect(() => {
    rootMetaRef.current = rootMeta;
  }, [rootMeta]);

  useEffect(() => {
    definitionsRef.current = definitions;
  }, [definitions]);

  useEffect(() => {
    const nextText = String(props.value || '').trim();
    if (lastEmittedSchemaRef.current !== null && nextText === lastEmittedSchemaRef.current) {
      return;
    }
    const parsed = parseSchemaRows(props.value);
    setRows(parsed.rows);
    setRootMeta(parsed.rootMeta);
    setDefinitions(parsed.definitions);
    setParseError(parsed.error);
    setUnsupportedKeywords(parsed.unsupportedKeywords);
    setCollapsedIds(new Set());
    setRootCollapsed(false);
  }, [props.value]);

  const definitionOptions = useMemo(() => buildDefinitionOptions(definitions), [definitions]);
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

  function emitRows(
    nextRows: SchemaFieldRow[],
    nextRootMeta?: Record<string, unknown>,
    nextDefinitions?: SchemaDefinitionDraft[]
  ) {
    const safeRootMeta = nextRootMeta || rootMetaRef.current;
    const safeDefinitions = nextDefinitions || definitionsRef.current;
    setRows(nextRows);
    setRootMeta(safeRootMeta);
    setDefinitions(safeDefinitions);
    setParseError('');
    setUnsupportedKeywords([]);
    const nextSchemaText = rowsToSchemaText(nextRows, safeRootMeta, safeDefinitions);
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
      const directChildren = rows
        .slice(index + 1, subtreeEnd)
        .filter(item => item.parentId === target.id && item.isArrayItem);
      let itemRow = directChildren[0] || null;
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
          const replaced: SchemaFieldRow = {
            ...nextRows[itemIndex],
            type: 'object',
            refName: '',
            additionalPropertiesMode: 'none'
          };
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

  function addAdditionalPropertyRow(targetId: string) {
    const index = findRowIndex(rows, targetId);
    if (index < 0) return;
    const target = rows[index];
    if (target.type !== 'object') return;

    const subtreeEnd = getSubtreeEnd(rows, index);
    const hasAdditionalPropertyRow = rows
      .slice(index + 1, subtreeEnd)
      .some(item => item.parentId === target.id && item.isAdditionalProperty);
    const nextRows: SchemaFieldRow[] = rows.map(item =>
      item.id === targetId ? { ...item, additionalPropertiesMode: 'schema' } : item
    );
    if (hasAdditionalPropertyRow) {
      emitRows(nextRows);
      return;
    }

    const mapRow = createEmptyRow({
      parentId: target.id,
      depth: target.depth + 1,
      isAdditionalProperty: true,
      type: 'string'
    });
    emitRows([...nextRows.slice(0, subtreeEnd), mapRow, ...nextRows.slice(subtreeEnd)]);
  }

  function addSiblingRow(targetId: string) {
    const index = findRowIndex(rows, targetId);
    if (index < 0) return;
    const target = rows[index];

    if (target.isArrayItem) {
      const arrayRow = getParentRow(rows, target);
      if (!arrayRow) return;
      const arrayIndex = findRowIndex(rows, arrayRow.id);
      if (arrayIndex < 0) return;
      const insertAt = getSubtreeEnd(rows, arrayIndex);
      const sibling = createEmptyRow({ parentId: arrayRow.parentId, depth: arrayRow.depth });
      emitRows([...rows.slice(0, insertAt), sibling, ...rows.slice(insertAt)]);
      return;
    }

    const insertAt = getSubtreeEnd(rows, index);
    const sibling = createEmptyRow({ parentId: target.parentId, depth: target.depth });
    emitRows([...rows.slice(0, insertAt), sibling, ...rows.slice(insertAt)]);
  }

  function replaceRowWithRef(rowId: string, refName: string, nextDefinitions?: SchemaDefinitionDraft[]) {
    const index = findRowIndex(rows, rowId);
    if (index < 0) return;
    const end = getSubtreeEnd(rows, index);
    const replacement: SchemaFieldRow = {
      ...rows[index],
      type: 'ref',
      refName,
      additionalPropertiesMode: 'none'
    };
    emitRows([...rows.slice(0, index), replacement, ...rows.slice(end)], undefined, nextDefinitions);
  }

  function setAdditionalPropertiesMode(rowId: string, mode: SchemaFieldRow['additionalPropertiesMode']) {
    const index = findRowIndex(rows, rowId);
    if (index < 0) return;
    const row = rows[index];
    if (row.type !== 'object') return;

    const subtreeEnd = getSubtreeEnd(rows, index);
    const removeIds = new Set(
      rows
        .slice(index + 1, subtreeEnd)
        .filter(item => item.parentId === row.id && item.isAdditionalProperty)
        .map(item => item.id)
    );

    let nextRows = rows
      .filter(item => !removeIds.has(item.id))
      .map(item => (item.id === rowId ? { ...item, additionalPropertiesMode: mode } : item));

    if (mode === 'schema') {
      const targetIndex = findRowIndex(nextRows, rowId);
      if (targetIndex >= 0) {
        const insertAt = getSubtreeEnd(nextRows, targetIndex);
        const mapRow = createEmptyRow({
          parentId: rowId,
          depth: nextRows[targetIndex].depth + 1,
          isAdditionalProperty: true,
          type: 'string'
        });
        nextRows = [...nextRows.slice(0, insertAt), mapRow, ...nextRows.slice(insertAt)];
      }
    }

    emitRows(nextRows);
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
    const nextType = patch.type || current.type;
    const updatedRow: SchemaFieldRow = {
      ...nextRows[index],
      ...patch,
      type: nextType,
      refName: nextType === 'ref' ? current.refName || definitions[0]?.name || '' : '',
      additionalPropertiesMode: nextType === 'object' ? 'none' : 'none'
    };
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
    setSchemaDraft(rowsToSchemaText(rows, rootMeta, definitions));
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
    setDefinitions(parsed.definitions);
    setParseError('');
    setUnsupportedKeywords(parsed.unsupportedKeywords);
    setCollapsedIds(new Set());
    setRootCollapsed(false);
    const nextText = rowsToSchemaText(parsed.rows, parsed.rootMeta, parsed.definitions);
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
        isAdditionalProperty: oldRow.isAdditionalProperty,
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
      setDefinitions(parsed.definitions);
      setParseError('');
      setUnsupportedKeywords(parsed.unsupportedKeywords);
      setCollapsedIds(new Set());
      setRootCollapsed(false);
      lastEmittedSchemaRef.current = schemaText;
      props.onChange(schemaText);
    } catch (error) {
      showError(`JSON 解析失败: ${String((error as Error).message || error)}`);
    }
  }

  function openDefinitionModal(definition?: SchemaDefinitionDraft) {
    setExtractingRowId('');
    setDefinitionEditingName(definition?.name || '');
    setDefinitionNameDraft(definition?.name || '');
    setDefinitionSchemaDraft(definition?.schemaText || '{\n  "type": "object"\n}');
    setDefinitionModalOpen(true);
  }

  function openExtractDefinition(rowId: string) {
    const row = rows.find(item => item.id === rowId);
    if (!row) return;
    const node = buildNodeFromRow(row, childrenMap);
    setExtractingRowId(rowId);
    setDefinitionEditingName('');
    setDefinitionNameDraft(String(row.name || 'Definition'));
    setDefinitionSchemaDraft(JSON.stringify(node, null, 2));
    setDefinitionModalOpen(true);
  }

  function saveDefinitionModal() {
    const name = String(definitionNameDraft || '').trim();
    if (!name) {
      showError('定义名称不能为空');
      return;
    }

    try {
      const parsed = normalizeNodeSchema(json5.parse(definitionSchemaDraft));
      if (!parsed) {
        showError('定义 schema 格式无效');
        return;
      }

      const nextDefinition: SchemaDefinitionDraft = {
        name,
        schemaText: JSON.stringify(parsed, null, 2)
      };
      const filteredDefinitions = definitions.filter(item => item.name !== definitionEditingName && item.name !== name);
      const nextDefinitions = [...filteredDefinitions, nextDefinition].sort((left, right) => left.name.localeCompare(right.name));
      setDefinitions(nextDefinitions);
      setDefinitionModalOpen(false);

      if (extractingRowId) {
        replaceRowWithRef(extractingRowId, name, nextDefinitions);
        setExtractingRowId('');
      } else {
        emitRows(rows, undefined, nextDefinitions);
      }

      setDefinitionEditingName('');
      setDefinitionNameDraft('');
      setDefinitionSchemaDraft('');
    } catch (error) {
      showError(`定义 schema 解析失败: ${String((error as Error).message || error)}`);
    }
  }

  function deleteDefinition(name: string) {
    if (rows.some(row => row.type === 'ref' && row.refName === name)) {
      showError(`定义 ${name} 仍被字段引用，无法删除`);
      return;
    }
    const nextDefinitions = definitions.filter(item => item.name !== name);
    emitRows(rows, undefined, nextDefinitions);
  }

  return (
    <div className="workspace-stack schema-editor space-y-4">
      <SchemaEditorHeader
        rootCollapsed={rootCollapsed}
        onToggleRootCollapse={() => setRootCollapsed(value => !value)}
        onImportJson={openImportJsonModal}
        onOpenSchema={openSchemaModal}
        onAddTopRow={addTopRow}
      />

      {parseError ? <Text c="red">当前 schema 解析失败: {parseError}</Text> : null}
      {unsupportedKeywords.length > 0 ? (
        <Text c="yellow">
          当前 schema 包含仅支持文本编辑的关键字: {unsupportedKeywords.join(', ')}
        </Text>
      ) : null}

      <div className="schema-editor-table-wrap overflow-x-auto rounded-2xl border border-slate-200 dark:border-[var(--border-project-subtle)]">
        <Table className="schema-editor-table" withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="w-[220px]">字段名</Table.Th>
              <Table.Th className="w-[72px]">必填</Table.Th>
              <Table.Th className="w-[220px]">类型</Table.Th>
              <Table.Th className="w-[140px]">mock</Table.Th>
              <Table.Th className="w-[180px]">description</Table.Th>
              <Table.Th className="w-[150px]">操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    暂无字段，点击 root 行右侧 + 添加子节点
                  </div>
                </Table.Td>
              </Table.Tr>
            ) : (
              visibleRows.map(row => {
                const hasChildren = (childrenMap.get(row.id) || []).length > 0;
                const expanded = !collapsedIds.has(row.id);
                const canAddChild = (row.type === 'object' || row.type === 'array') && !row.isArrayItem && !row.isAdditionalProperty;
                const addTooltip = canAddChild ? '添加同级节点或子节点' : '添加同级节点';
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <div className="schema-editor-tree-row flex items-center gap-2" style={{ paddingLeft: row.depth * 18 }}>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          className="schema-editor-toggle-button dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100 disabled:dark:!border-transparent disabled:dark:!bg-transparent disabled:dark:!text-slate-600"
                          onClick={() => hasChildren && toggleRowCollapse(row.id)}
                          disabled={!hasChildren}
                          aria-label={
                            hasChildren
                              ? expanded
                                ? `收起字段 ${row.name || '未命名字段'}`
                                : `展开字段 ${row.name || '未命名字段'}`
                              : `字段 ${row.name || '未命名字段'} 无子节点`
                          }
                        >
                          {hasChildren ? (
                            expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />
                          ) : (
                            <span className="block h-4 w-4" />
                          )}
                        </ActionIcon>
                        <TextInput
                          value={row.isArrayItem ? 'items' : row.isAdditionalProperty ? '{key}' : row.name}
                          onChange={event => patchRow(row.id, { name: event.currentTarget.value })}
                          placeholder={row.isArrayItem ? 'items' : row.isAdditionalProperty ? '{key}' : 'name'}
                          disabled={row.isArrayItem || row.isAdditionalProperty}
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
                      <Stack gap={6}>
                        <TypeSelector value={row.type} onChange={value => patchRow(row.id, { type: value })} />
                        {row.type === 'ref' ? (
                          <Select
                            value={row.refName || null}
                            data={definitionOptions}
                            placeholder="选择定义"
                            onChange={value => patchRow(row.id, { refName: value || '' })}
                            aria-label="引用定义"
                          />
                        ) : null}
                        {row.type === 'object' ? (
                          <Select
                            value={row.additionalPropertiesMode}
                            data={[
                              { value: 'none', label: '无额外字段规则' },
                              { value: 'closed', label: '禁止额外字段' },
                              { value: 'any', label: '任意额外字段' },
                              { value: 'schema', label: 'Map 值 schema' }
                            ]}
                            onChange={value => setAdditionalPropertiesMode(row.id, (value as SchemaFieldRow['additionalPropertiesMode']) || 'none')}
                            aria-label="额外字段模式"
                          />
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <MockGenerator
                        value={row.mockValue}
                        onChange={value => patchRow(row.id, { mockValue: value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <PropertyEditor
                        value={row.description}
                        onChange={value => patchRow(row.id, { description: value })}
                        placeholder="备注"
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="schema-editor-row-actions flex items-center gap-1">
                        <Tooltip label="查看字段 Schema">
                          <ActionIcon
                            variant="subtle"
                            className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
                            onClick={() => openFieldModal(row.id)}
                            aria-label={`查看字段 ${row.name || '未命名字段'} 的 Schema`}
                          >
                            <IconSettings size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Menu shadow="md" width={220} position="bottom-end">
                          <Menu.Target>
                            <div>
                              <Tooltip label={addTooltip}>
                                <ActionIcon
                                  variant="subtle"
                                  className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
                                  aria-label={`为字段 ${row.name || '未命名字段'} 选择新增方式`}
                                >
                                  <IconPlus size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </div>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => addSiblingRow(row.id)}>添加同级节点</Menu.Item>
                            {canAddChild ? <Menu.Item onClick={() => addChildRow(row.id)}>添加子节点</Menu.Item> : null}
                            {row.type === 'object' && !row.isArrayItem && !row.isAdditionalProperty ? (
                              <Menu.Item onClick={() => addAdditionalPropertyRow(row.id)}>添加 map 值 schema</Menu.Item>
                            ) : null}
                            {!row.isArrayItem && !row.isAdditionalProperty ? (
                              <Menu.Item onClick={() => openExtractDefinition(row.id)}>提取为定义并引用</Menu.Item>
                            ) : null}
                          </Menu.Dropdown>
                        </Menu>
                        {!row.isArrayItem && !row.isAdditionalProperty ? (
                          <Tooltip label="提取为定义">
                            <ActionIcon
                              variant="subtle"
                              className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
                              onClick={() => openExtractDefinition(row.id)}
                              aria-label={`提取字段 ${row.name || '未命名字段'} 为定义`}
                            >
                              <IconSettings size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        <Tooltip label="删除字段">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            className="dark:!border-transparent dark:!bg-transparent dark:!text-rose-400 dark:hover:!border-rose-700 dark:hover:!bg-rose-950/40 dark:hover:!text-rose-300"
                            onClick={() => removeRow(row.id)}
                            aria-label={`删除字段 ${row.name || '未命名字段'}`}
                          >
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

      <div className="rounded-2xl border border-slate-200 p-4 dark:border-[var(--border-project-subtle)]">
        <div className="mb-3 flex items-center justify-between">
          <Text fw={600}>Definitions</Text>
          <Button size="xs" variant="light" onClick={() => openDefinitionModal()}>
            新建定义
          </Button>
        </div>
        {definitions.length === 0 ? (
          <Text size="sm" c="dimmed">暂无定义</Text>
        ) : (
          <div className="space-y-2">
            {definitions.map(item => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-[var(--border-project-subtle)]"
              >
                <div className="min-w-0">
                  <Text fw={500}>{item.name}</Text>
                  <Text size="sm" c="dimmed" lineClamp={1}>
                    {item.schemaText.split('\n')[0]}
                  </Text>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="subtle" onClick={() => openDefinitionModal(item)}>
                    编辑
                  </Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => deleteDefinition(item.name)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
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

      <Modal
        title={extractingRowId ? '提取为定义' : '编辑定义'}
        opened={definitionModalOpen}
        onClose={() => {
          setDefinitionModalOpen(false);
          setExtractingRowId('');
        }}
        size="xl"
      >
        <Stack gap="md">
          <TextInput
            label="定义名称"
            value={definitionNameDraft}
            onChange={event => setDefinitionNameDraft(event.currentTarget.value)}
            placeholder="Category"
          />
          <Textarea
            label="定义 Schema"
            minRows={16}
            autosize
            value={definitionSchemaDraft}
            onChange={event => setDefinitionSchemaDraft(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setDefinitionModalOpen(false);
                setExtractingRowId('');
              }}
            >
              取消
            </Button>
            <Button onClick={saveDefinitionModal}>保存</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
