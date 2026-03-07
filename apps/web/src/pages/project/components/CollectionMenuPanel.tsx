import type { KeyboardEvent } from 'react';
import { Badge, Button, Text, Tooltip } from '@mantine/core';
import {
  IconCopy,
  IconEdit,
  IconFolderOpen,
  IconFileImport,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { ResourceGroupCard } from '../../../domains/interface/ResourceGroupCard';
import { ResourceIconButton } from '../../../domains/interface/ResourceIconButton';
import { ResourceLeafRow } from '../../../domains/interface/ResourceLeafRow';
import { ResourceNavShell } from '../../../domains/interface/ResourceNavShell';

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
    <ResourceNavShell
      searchValue={props.colKeyword}
      onSearchChange={props.onColKeywordChange}
      searchPlaceholder="搜索测试集合"
      actions={
        props.canEdit ? (
          <div className="interface-nav-filter-actions flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={props.onOpenAddCol} leftSection={<IconPlus size={14} />}>
              添加集合
            </Button>
          </div>
        ) : null
      }
      summary={
        <>
          {keywordMode ? '筛选结果：' : ''}
          {props.colDisplayRows.length} 个集合，{totalCases} 个用例
        </>
      }
      emptyState={
        props.colDisplayRows.length === 0 ? (
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
        ) : null
      }
    >

      {props.colDisplayRows.map(col => {
        const colId = Number(col._id || 0);
        const activeCol = props.selectedColId === colId && (props.action === 'col' || props.action === 'case');
        const expanded = keywordMode || props.expandedColIds.includes(colId);
        const caseList = col.caseList || [];

        return (
          <ResourceGroupCard
            key={`col-${colId}`}
            active={activeCol}
            expanded={expanded}
            name={String(col.name || '')}
            count={caseList.length}
            folderIcon={<IconFolderOpen size={16} className="interface-nav-group-folder" />}
            dragEnabled={props.colDragEnabled}
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
            onDragStart={event => {
              if (!props.colDragEnabled) return;
              props.onDragStartCol(colId);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={props.onDragEnd}
            onNavigate={() => props.onNavigateCol(colId)}
            onKeyNavigate={event => triggerWithKeyboard(event, () => props.onNavigateCol(colId))}
            onToggle={() => {
              if (keywordMode) return;
              props.onToggleExpandCol(colId);
            }}
            toggleLabelExpanded="收起集合"
            toggleLabelCollapsed="展开集合"
            actions={
              props.canEdit ? (
                <>
                  <ResourceIconButton label="删除集合" onClick={() => props.onDeleteCol(colId)}>
                    <IconTrash size={14} />
                  </ResourceIconButton>
                  <ResourceIconButton label="编辑集合" onClick={() => props.onEditCol(col)}>
                    <IconEdit size={14} />
                  </ResourceIconButton>
                  <ResourceIconButton label="导入接口" onClick={() => props.onImportCol(colId)}>
                    <IconFileImport size={14} />
                  </ResourceIconButton>
                  <ResourceIconButton label="复制集合" onClick={() => props.onCopyCol(col)}>
                    <IconCopy size={14} />
                  </ResourceIconButton>
                </>
              ) : null
            }
          >
            {(expanded ? caseList : []).map(item => {
              const id = String(item._id || '');
              return (
                <ResourceLeafRow
                  key={`case-${id}`}
                  active={props.action === 'case' && props.caseId === id}
                  dragEnabled={props.colDragEnabled}
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
                  onNavigate={() => props.onNavigateCase(id)}
                  onKeyNavigate={event => triggerWithKeyboard(event, () => props.onNavigateCase(id))}
                  leading={<Badge color="blue" variant="light">CASE</Badge>}
                  title={
                    <Tooltip label={String(item.path || '')}>
                      <span className="interface-nav-item-title">{String(item.casename || item.title || id)}</span>
                    </Tooltip>
                  }
                  actions={
                    props.canEdit ? (
                      <div className="interface-nav-item-actions flex items-center gap-1">
                        <ResourceIconButton label="删除用例" onClick={() => props.onDeleteCase(id)}>
                          <IconTrash size={14} />
                        </ResourceIconButton>
                        <ResourceIconButton label="复制用例" onClick={() => props.onCopyCase(id)}>
                          <IconCopy size={14} />
                        </ResourceIconButton>
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </ResourceGroupCard>
        );
      })}
    </ResourceNavShell>
  );
}
