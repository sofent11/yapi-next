import type { KeyboardEvent, ReactNode } from 'react';
import { Badge, Button, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconEdit,
  IconFolderOpen,
  IconFileImport,
  IconPlus,
  IconSearch,
  IconTrash
} from '@tabler/icons-react';
import { FilterBar } from '../../../components/layout';

type CollectionCaseRow = {
  _id?: string | number;
  casename?: string;
  title?: string;
  path?: string;
  [key: string]: unknown;
};

type CollectionRow = {
  _id?: number;
  name?: string;
  caseList?: CollectionCaseRow[];
  [key: string]: unknown;
};

type CollectionMenuPanelProps = {
  colKeyword: string;
  canEdit: boolean;
  colDisplayRows: CollectionRow[];
  selectedColId: number;
  action: string;
  caseId: string;
  expandedColIds: number[];
  colDragEnabled: boolean;
  onColKeywordChange: (value: string) => void;
  onOpenAddCol: () => void;
  onToggleExpandCol: (colId: number) => void;
  onNavigateCol: (colId: number) => void;
  onNavigateCase: (caseId: string) => void;
  onDragStartCol: (colId: number) => void;
  onDragStartCase: (colId: number, caseId: string) => void;
  onDragEnd: () => void;
  onDropCol: (colId: number) => void;
  onDropCase: (colId: number, caseId: string) => void;
  onDeleteCol: (colId: number) => void;
  onEditCol: (col: CollectionRow) => void;
  onImportCol: (colId: number) => void;
  onCopyCol: (col: CollectionRow) => void;
  onDeleteCase: (caseId: string) => void;
  onCopyCase: (caseId: string) => void;
};

function IconButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="interface-icon-button"
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}

export function CollectionMenuPanel(props: CollectionMenuPanelProps) {
  const keywordMode = props.colKeyword.trim().length > 0;
  const totalCases = props.colDisplayRows.reduce((sum, col) => sum + (col.caseList?.length || 0), 0);

  const triggerWithKeyboard = (event: KeyboardEvent<HTMLElement>, handler: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      handler();
    }
  };

  return (
    <div className="interface-nav">
      <div className="interface-nav-actions">
        <FilterBar
          className="interface-nav-filter"
          left={
            <TextInput
              value={props.colKeyword}
              onChange={event => props.onColKeywordChange(event.currentTarget.value)}
              placeholder="搜索测试集合"
              leftSection={<IconSearch size={16} />}
              className="interface-nav-filter-input"
            />
          }
          right={
            props.canEdit ? (
              <div className="interface-nav-filter-actions flex flex-wrap items-center gap-2">
                <Button size="xs" onClick={props.onOpenAddCol} leftSection={<IconPlus size={14} />}>
                  添加集合
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      <div className="interface-nav-summary">
        <Text c="dimmed" size="sm">
          {keywordMode ? '筛选结果：' : ''}
          {props.colDisplayRows.length} 个集合，{totalCases} 个用例
        </Text>
      </div>

      <div className="interface-nav-list">
        {props.colDisplayRows.length === 0 ? (
          <div className="interface-nav-empty py-10 text-center">
            <Text c="dimmed">{keywordMode ? '未找到匹配的测试集合' : '暂无测试集合'}</Text>
            {!keywordMode && props.canEdit ? (
              <div className="mt-3">
                <Button size="xs" onClick={props.onOpenAddCol} leftSection={<IconPlus size={14} />}>
                  新建集合
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {props.colDisplayRows.map(col => {
          const colId = Number(col._id || 0);
          const activeCol = props.selectedColId === colId && (props.action === 'col' || props.action === 'case');
          const expanded = keywordMode || props.expandedColIds.includes(colId);
          const caseList = col.caseList || [];

          return (
            <div
              key={`col-${colId}`}
              className="interface-nav-group"
              onDragOver={event => {
                if (!props.colDragEnabled) return;
                event.preventDefault();
              }}
              onDrop={event => {
                if (!props.colDragEnabled) return;
                event.preventDefault();
                event.stopPropagation();
                props.onDropCol(colId);
              }}
            >
              <div
                className={`interface-nav-group-title${activeCol ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-current={activeCol ? 'page' : undefined}
                draggable={props.colDragEnabled}
                onDragStart={event => {
                  if (!props.colDragEnabled) return;
                  props.onDragStartCol(colId);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={props.onDragEnd}
                onClick={() => props.onNavigateCol(colId)}
                onKeyDown={event => triggerWithKeyboard(event, () => props.onNavigateCol(colId))}
              >
                <span className="interface-nav-group-main">
                  <button
                    type="button"
                    className="interface-nav-group-toggle"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (keywordMode) return;
                      props.onToggleExpandCol(colId);
                    }}
                    aria-label={expanded ? '收起集合' : '展开集合'}
                    aria-expanded={expanded}
                  >
                    {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </button>
                  <IconFolderOpen size={16} className="interface-nav-group-folder" />
                  <span className="interface-nav-group-name">{String(col.name || '')}</span>
                </span>
                <div className="interface-nav-group-actions flex items-center gap-1">
                  {props.canEdit ? (
                    <>
                      <IconButton label="删除集合" onClick={() => props.onDeleteCol(colId)}>
                        <IconTrash size={14} />
                      </IconButton>
                      <IconButton label="编辑集合" onClick={() => props.onEditCol(col)}>
                        <IconEdit size={14} />
                      </IconButton>
                      <IconButton label="导入接口" onClick={() => props.onImportCol(colId)}>
                        <IconFileImport size={14} />
                      </IconButton>
                      <IconButton label="复制集合" onClick={() => props.onCopyCol(col)}>
                        <IconCopy size={14} />
                      </IconButton>
                    </>
                  ) : null}
                  <Badge variant="light" color="gray">{caseList.length}</Badge>
                </div>
              </div>

              {(expanded ? caseList : []).map(item => {
                const id = String(item._id || '');
                return (
                  <div
                    key={`case-${id}`}
                    className={`interface-nav-item${props.action === 'case' && props.caseId === id ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-current={props.action === 'case' && props.caseId === id ? 'page' : undefined}
                    draggable={props.colDragEnabled}
                    onDragStart={event => {
                      if (!props.colDragEnabled) return;
                      props.onDragStartCase(colId, id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={props.onDragEnd}
                    onDragOver={event => {
                      if (!props.colDragEnabled) return;
                      event.preventDefault();
                    }}
                    onDrop={event => {
                      if (!props.colDragEnabled) return;
                      event.preventDefault();
                      event.stopPropagation();
                      props.onDropCase(colId, id);
                    }}
                    onClick={() => props.onNavigateCase(id)}
                    onKeyDown={event => triggerWithKeyboard(event, () => props.onNavigateCase(id))}
                  >
                    <Badge color="blue" variant="light">CASE</Badge>
                    <Tooltip label={String(item.path || '')}>
                      <span className="interface-nav-item-title">{String(item.casename || item.title || id)}</span>
                    </Tooltip>
                    {props.canEdit ? (
                      <div className="interface-nav-item-actions flex items-center gap-1">
                        <IconButton label="删除用例" onClick={() => props.onDeleteCase(id)}>
                          <IconTrash size={14} />
                        </IconButton>
                        <IconButton label="复制用例" onClick={() => props.onCopyCase(id)}>
                          <IconCopy size={14} />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
