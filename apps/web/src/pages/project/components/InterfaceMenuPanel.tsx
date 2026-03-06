import type { KeyboardEvent, ReactNode } from 'react';
import { Badge, Button, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconPlus,
  IconSearch,
  IconTrash,
  IconEdit
} from '@tabler/icons-react';
import type { InterfaceTreeNode, LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { FilterBar } from '../../../components/layout';

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
  onCopyInterface: (row: LegacyInterfaceDTO) => void;
  onDeleteInterface: (interfaceId: number) => void;
  methodClassName: (method?: string) => string;
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
    <div className="interface-nav">
      <div className="interface-nav-actions">
        <FilterBar
          className="interface-nav-filter"
          left={
            <TextInput
              value={props.menuKeyword}
              onChange={event => props.onMenuKeywordChange(event.currentTarget.value)}
              placeholder="搜索接口"
              leftSection={<IconSearch size={16} />}
              className="interface-nav-filter-input"
            />
          }
          right={
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
        />
      </div>

      <div className="interface-nav-summary">
        <Text c="dimmed" size="sm">
          {keywordMode ? '筛选结果：' : ''}
          {props.menuDisplayRows.length} 个分类，{totalInterfaceCount} 个接口
        </Text>
      </div>

      <div className="interface-nav-list">
        {props.menuDisplayRows.length === 0 ? (
          <div className="interface-nav-empty py-10 text-center">
            <Text c="dimmed">{keywordMode ? '未找到匹配的接口分类或接口' : '暂无接口分类'}</Text>
          </div>
        ) : null}

        {props.menuDisplayRows.map(cat => {
          const catIdNum = Number(cat._id || 0);
          const expanded = keywordMode || props.expandedCatIds.includes(catIdNum);
          const shouldShowInterfaces = keywordMode || props.expandedCatIds.includes(catIdNum);
          const catLoading = props.catLoadingMap[catIdNum] === true;
          const visibleInterfaces = shouldShowInterfaces ? (cat.list || []) : [];

          return (
            <div
              key={`cat-${cat._id}`}
              className="interface-nav-group"
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
            >
              <div
                className={`interface-nav-group-title${props.catId === catIdNum ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-current={props.catId === catIdNum ? 'page' : undefined}
                draggable={props.menuDragEnabled}
                onDragStart={event => {
                  if (!props.menuDragEnabled) return;
                  props.onDragStartCat(catIdNum);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={props.onDragEnd}
                onClick={() => props.onNavigateCat(catIdNum)}
                onKeyDown={event => triggerWithKeyboard(event, () => props.onNavigateCat(catIdNum))}
              >
                <span className="interface-nav-group-main">
                  <button
                    type="button"
                    className="interface-nav-group-toggle"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (keywordMode) return;
                      const opened = props.expandedCatIds.includes(catIdNum);
                      if (!opened) {
                        props.onEnsureCatLoaded(catIdNum);
                      }
                      props.onToggleExpandCat(catIdNum);
                    }}
                    aria-label={expanded ? '收起分类' : '展开分类'}
                    aria-expanded={expanded}
                  >
                    {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </button>
                  <span className="interface-nav-group-name">{cat.name}</span>
                </span>

                <div className="interface-nav-group-actions flex items-center gap-1">
                  {props.canEdit ? (
                    <>
                      <IconButton
                        label="在分类下新增接口"
                        onClick={() => props.onOpenAddInterfaceInCat(catIdNum)}
                      >
                        <IconPlus size={14} />
                      </IconButton>
                      <IconButton label="编辑分类" onClick={() => props.onEditCat(cat)}>
                        <IconEdit size={14} />
                      </IconButton>
                      <IconButton label="删除分类" onClick={() => props.onDeleteCat(cat)}>
                        <IconTrash size={14} />
                      </IconButton>
                    </>
                  ) : null}
                  <Badge variant="light" color="gray">{cat.interface_count || cat.list?.length || 0}</Badge>
                </div>
              </div>

              {shouldShowInterfaces && visibleInterfaces.length === 0 && catLoading ? (
                <div className="interface-nav-tip">加载接口中...</div>
              ) : null}
              {shouldShowInterfaces && visibleInterfaces.length === 0 && !catLoading ? (
                <div className="interface-nav-tip">暂无接口</div>
              ) : null}

              {visibleInterfaces.map(item => {
                const interfaceId = Number(item._id || 0);
                return (
                  <div
                    key={`iface-${item._id}`}
                    className={`interface-nav-item${props.interfaceId === interfaceId ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-current={props.interfaceId === interfaceId ? 'page' : undefined}
                    draggable={props.menuDragEnabled}
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
                    onClick={() => props.onNavigateInterface(interfaceId)}
                    onKeyDown={event => triggerWithKeyboard(event, () => props.onNavigateInterface(interfaceId))}
                  >
                    <span className={props.methodClassName(item.method)}>
                      {String(item.method || 'GET').toUpperCase()}
                    </span>
                    <Tooltip label={item.path}>
                      <span className="interface-nav-item-title">{item.title || item.path}</span>
                    </Tooltip>
                    {props.canEdit ? (
                      <div className="interface-nav-item-actions flex items-center gap-1">
                        <IconButton label="复制接口" onClick={() => props.onCopyInterface(item)}>
                          <IconCopy size={14} />
                        </IconButton>
                        <IconButton label="删除接口" onClick={() => props.onDeleteInterface(interfaceId)}>
                          <IconTrash size={14} />
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
