import type { KeyboardEvent } from 'react';
import { Badge, Button, Text, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconPlus,
  IconTrash,
  IconEdit
} from '@tabler/icons-react';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../../types/interface-dto';
import { ResourceGroupCard } from '../../../domains/interface/ResourceGroupCard';
import { ResourceIconButton } from '../../../domains/interface/ResourceIconButton';
import { ResourceLeafRow } from '../../../domains/interface/ResourceLeafRow';
import { ResourceNavShell } from '../../../domains/interface/ResourceNavShell';

type InterfaceMenuPanelProps = {
  menuKeyword: string;
  canEdit: boolean;
  hasCategories: boolean;
  menuDisplayRows: InterfaceTreeNode[];
  catId: number;
  interfaceId: number;
  expandedCatIds: number[];
  menuDragEnabled: boolean;
  catLoadingMap: Record<number, boolean>;
  onMenuKeywordChange: (value: string) => void;
  onNavigateAll: () => void;
  onOpenAddInterface: () => void;
  onOpenAddCat: () => void;
  onDropCat: (catId: number) => void;
  onToggleExpandCat: (catId: number) => void;
  onEnsureCatLoaded: (catId: number) => void;
  onNavigateCat: (catId: number) => void;
  onDragStartCat: (catId: number) => void;
  onDragStartInterface: (catId: number, interfaceId: number) => void;
  onDragEnd: () => void;
  onDropInterface: (catId: number, interfaceId: number) => void;
  onOpenAddInterfaceInCat: (catId: number) => void;
  onEditCat: (cat: InterfaceTreeNode) => void;
  onDeleteCat: (cat: InterfaceTreeNode) => void;
  onNavigateInterface: (interfaceId: number) => void;
  onCopyInterface: (row: InterfaceDTO) => void;
  onDeleteInterface: (interfaceId: number) => void;
  methodClassName: (method?: string) => string;
};

export function InterfaceMenuPanel(props: InterfaceMenuPanelProps) {
  const keywordMode = props.menuKeyword.trim().length > 0;
  const totalInterfaceCount = props.menuDisplayRows.reduce(
    (sum, cat) => sum + Number(cat.interface_count || cat.list?.length || 0),
    0
  );

  const triggerWithKeyboard = (event: KeyboardEvent<HTMLElement>, handler: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      handler();
    }
  };

  return (
    <ResourceNavShell
      searchValue={props.menuKeyword}
      onSearchChange={props.onMenuKeywordChange}
      searchPlaceholder="搜索接口"
      actions={
        <div className="interface-nav-filter-actions flex flex-wrap items-center gap-2">
          <button type="button" className="interface-link-button" onClick={props.onNavigateAll}>
            全部接口
          </button>
          {props.canEdit ? (
            <>
              <Button size="xs" onClick={props.onOpenAddInterface} disabled={!props.hasCategories} leftSection={<IconPlus size={14} />}>
                接口
              </Button>
              <Button size="xs" variant="default" onClick={props.onOpenAddCat} leftSection={<IconPlus size={14} />}>
                分类
              </Button>
            </>
          ) : null}
        </div>
      }
      summary={
        <>
          {keywordMode ? '筛选结果：' : ''}
          {props.menuDisplayRows.length} 个分类，{totalInterfaceCount} 个接口
        </>
      }
      emptyState={
        props.menuDisplayRows.length === 0 ? (
          <div className="interface-nav-empty py-10 text-center">
            <Text c="dimmed">{keywordMode ? '未找到匹配的接口分类或接口' : '暂无接口分类'}</Text>
          </div>
        ) : null
      }
    >

      {props.menuDisplayRows.map(cat => {
        const catIdNum = Number(cat._id || 0);
        const expanded = keywordMode || props.expandedCatIds.includes(catIdNum);
        const shouldShowInterfaces = keywordMode || props.expandedCatIds.includes(catIdNum);
        const catLoading = props.catLoadingMap[catIdNum] === true;
        const visibleInterfaces = shouldShowInterfaces ? (cat.list || []) : [];

        return (
          <ResourceGroupCard
            key={`cat-${cat._id}`}
            active={props.catId === catIdNum}
            expanded={expanded}
            name={cat.name}
            count={cat.interface_count || cat.list?.length || 0}
            dragEnabled={props.menuDragEnabled}
            onDragOver={event => {
              if (!props.menuDragEnabled) return;
              event.preventDefault();
            }}
            onDrop={event => {
              if (!props.menuDragEnabled) return;
              event.preventDefault();
              event.stopPropagation();
              props.onDropCat(catIdNum);
            }}
            onDragStart={event => {
              if (!props.menuDragEnabled) return;
              props.onDragStartCat(catIdNum);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={props.onDragEnd}
            onNavigate={() => props.onNavigateCat(catIdNum)}
            onKeyNavigate={event => triggerWithKeyboard(event, () => props.onNavigateCat(catIdNum))}
            onToggle={() => {
              if (keywordMode) return;
              const opened = props.expandedCatIds.includes(catIdNum);
              if (!opened) {
                props.onEnsureCatLoaded(catIdNum);
              }
              props.onToggleExpandCat(catIdNum);
            }}
            toggleLabelExpanded="收起分类"
            toggleLabelCollapsed="展开分类"
            actions={
              props.canEdit ? (
                <>
                  <ResourceIconButton
                    label="在分类下新增接口"
                    onClick={() => props.onOpenAddInterfaceInCat(catIdNum)}
                  >
                    <IconPlus size={14} />
                  </ResourceIconButton>
                  <ResourceIconButton label="编辑分类" onClick={() => props.onEditCat(cat)}>
                    <IconEdit size={14} />
                  </ResourceIconButton>
                  <ResourceIconButton label="删除分类" onClick={() => props.onDeleteCat(cat)}>
                    <IconTrash size={14} />
                  </ResourceIconButton>
                </>
              ) : null
            }
          >
            {shouldShowInterfaces && visibleInterfaces.length === 0 && catLoading ? (
              <div className="interface-nav-tip">加载接口中...</div>
            ) : null}
            {shouldShowInterfaces && visibleInterfaces.length === 0 && !catLoading ? (
              <div className="interface-nav-tip">暂无接口</div>
            ) : null}

            {visibleInterfaces.map(item => {
              const interfaceId = Number(item._id || 0);
              return (
                <ResourceLeafRow
                  key={`iface-${item._id}`}
                  active={props.interfaceId === interfaceId}
                  dragEnabled={props.menuDragEnabled}
                  onDragStart={event => {
                    if (!props.menuDragEnabled) return;
                    props.onDragStartInterface(catIdNum, interfaceId);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={props.onDragEnd}
                  onDragOver={event => {
                    if (!props.menuDragEnabled) return;
                    event.preventDefault();
                  }}
                  onDrop={event => {
                    if (!props.menuDragEnabled) return;
                    event.preventDefault();
                    event.stopPropagation();
                    props.onDropInterface(catIdNum, interfaceId);
                  }}
                  onNavigate={() => props.onNavigateInterface(interfaceId)}
                  onKeyNavigate={event => triggerWithKeyboard(event, () => props.onNavigateInterface(interfaceId))}
                  leading={
                    <span className={props.methodClassName(item.method)}>
                      {String(item.method || 'GET').toUpperCase()}
                    </span>
                  }
                  title={
                    <Tooltip label={item.path}>
                      <span className="interface-nav-item-title">{item.title || item.path}</span>
                    </Tooltip>
                  }
                  actions={
                    props.canEdit ? (
                      <div className="interface-nav-item-actions flex items-center gap-1">
                        <ResourceIconButton label="复制接口" onClick={() => props.onCopyInterface(item)}>
                          <IconCopy size={14} />
                        </ResourceIconButton>
                        <ResourceIconButton label="删除接口" onClick={() => props.onDeleteInterface(interfaceId)}>
                          <IconTrash size={14} />
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
