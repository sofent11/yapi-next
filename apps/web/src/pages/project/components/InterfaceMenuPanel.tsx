import { Button, Input, Space, Tag, Tooltip } from 'antd';
import type { CSSProperties, KeyboardEvent } from 'react';
import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined
} from '@ant-design/icons';
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
  methodStyle: (method?: string) => CSSProperties;
};

export function InterfaceMenuPanel(props: InterfaceMenuPanelProps) {
  const keywordMode = props.menuKeyword.trim().length > 0;
  const triggerWithKeyboard = (
    event: KeyboardEvent<HTMLSpanElement>,
    handler: () => void
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      handler();
    }
  };

  return (
    <div className="legacy-interface-menu">
      <div className="legacy-interface-menu-actions">
        <FilterBar
          className="legacy-interface-filter"
          left={
            <Input
              value={props.menuKeyword}
              onChange={event => props.onMenuKeywordChange(event.target.value)}
              placeholder="搜索接口"
              prefix={<SearchOutlined />}
              allowClear
              className="legacy-interface-filter-input"
            />
          }
          right={
            <Space className="legacy-interface-filter-actions" size={8}>
              <button
                type="button"
                className="legacy-interface-menu-link-btn"
                onClick={props.onNavigateAll}
              >
                全部接口
              </button>
              {props.canEdit ? (
                <>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={props.onOpenAddInterface}
                    disabled={!props.hasCategories}
                  >
                    接口
                  </Button>
                  <Button icon={<PlusOutlined />} onClick={props.onOpenAddCat}>
                    分类
                  </Button>
                </>
              ) : null}
            </Space>
          }
        />
      </div>
      <div className="legacy-interface-menu-list">
        {props.menuDisplayRows.map(cat => {
          const catIdNum = Number(cat._id || 0);
          const expanded = keywordMode || props.expandedCatIds.includes(catIdNum);
          const shouldShowInterfaces = keywordMode || props.expandedCatIds.includes(catIdNum);
          const catLoading = props.catLoadingMap[catIdNum] === true;
          const visibleInterfaces = shouldShowInterfaces ? (cat.list || []) : [];

          return (
            <div
              key={`cat-${cat._id}`}
              className="legacy-interface-cat"
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
              <button
                type="button"
                className={`legacy-interface-cat-title${props.catId === catIdNum ? ' active' : ''}`}
                draggable={props.menuDragEnabled}
                onDragStart={event => {
                  if (!props.menuDragEnabled) return;
                  props.onDragStartCat(catIdNum);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={props.onDragEnd}
                onClick={() => props.onNavigateCat(catIdNum)}
              >
                <span className="legacy-interface-cat-main">
                  <span
                    className="legacy-interface-cat-toggle"
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
                  >
                    {expanded ? <DownOutlined /> : <RightOutlined />}
                  </span>
                  <span className="legacy-interface-cat-name">{cat.name}</span>
                </span>
                <Space size={4} className="legacy-interface-cat-actions">
                  {props.canEdit ? (
                    <>
                      <span
                        className="legacy-interface-icon-btn"
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onOpenAddInterfaceInCat(catIdNum);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onOpenAddInterfaceInCat(catIdNum))
                        }
                      >
                        <PlusOutlined />
                      </span>
                      <span
                        className="legacy-interface-icon-btn"
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onEditCat(cat);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onEditCat(cat))
                        }
                      >
                        <EditOutlined />
                      </span>
                      <span
                        className="legacy-interface-icon-btn"
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onDeleteCat(cat);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onDeleteCat(cat))
                        }
                      >
                        <DeleteOutlined />
                      </span>
                    </>
                  ) : null}
                  <Tag>{cat.interface_count || cat.list?.length || 0}</Tag>
                </Space>
              </button>

              {shouldShowInterfaces && visibleInterfaces.length === 0 && catLoading ? (
                <div style={{ padding: '6px 12px', color: '#8c8c8c', fontSize: 12 }}>
                  加载接口中...
                </div>
              ) : null}
              {shouldShowInterfaces && visibleInterfaces.length === 0 && !catLoading ? (
                <div style={{ padding: '6px 12px', color: '#8c8c8c', fontSize: 12 }}>
                  暂无接口
                </div>
              ) : null}

              {visibleInterfaces.map(item => {
                const interfaceId = Number(item._id || 0);
                return (
                  <button
                    key={`iface-${item._id}`}
                    type="button"
                    className={`legacy-interface-item${props.interfaceId === interfaceId ? ' active' : ''}`}
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
                  >
                    <span
                      className="legacy-method-pill"
                      style={props.methodStyle(item.method)}
                    >
                      {String(item.method || 'GET').toUpperCase()}
                    </span>
                    <Tooltip title={item.path}>
                      <span className="legacy-interface-item-title">
                        {item.title || item.path}
                      </span>
                    </Tooltip>
                    {props.canEdit ? (
                      <Space size={4} className="legacy-interface-item-actions">
                        <span
                          className="legacy-interface-icon-btn"
                          role="button"
                          tabIndex={0}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onCopyInterface(item);
                          }}
                          onKeyDown={event =>
                            triggerWithKeyboard(event, () => props.onCopyInterface(item))
                          }
                        >
                          <CopyOutlined />
                        </span>
                        <span
                          className="legacy-interface-icon-btn"
                          role="button"
                          tabIndex={0}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onDeleteInterface(interfaceId);
                          }}
                          onKeyDown={event =>
                            triggerWithKeyboard(event, () => props.onDeleteInterface(interfaceId))
                          }
                        >
                          <DeleteOutlined />
                        </span>
                      </Space>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
