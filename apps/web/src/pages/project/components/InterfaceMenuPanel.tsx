import { Button, Empty, Input, Space, Tag, Tooltip, Typography } from 'antd';
import type { KeyboardEvent } from 'react';
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

const { Text } = Typography;

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

export function InterfaceMenuPanel(props: InterfaceMenuPanelProps) {
  const keywordMode = props.menuKeyword.trim().length > 0;
  const totalInterfaceCount = props.menuDisplayRows.reduce(
    (sum, cat) => sum + Number(cat.interface_count || cat.list?.length || 0),
    0
  );
  const triggerWithKeyboard = (
    event: KeyboardEvent<HTMLElement>,
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
      <div className="legacy-interface-menu-summary">
        <Text type="secondary">
          {keywordMode ? '筛选结果：' : ''}
          {props.menuDisplayRows.length} 个分类，{totalInterfaceCount} 个接口
        </Text>
      </div>
      <div className="legacy-interface-menu-list">
        {props.menuDisplayRows.length === 0 ? (
          <div className="legacy-interface-menu-empty">
            <Empty
              description={keywordMode ? '未找到匹配的接口分类或接口' : '暂无接口分类'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
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
              <div
                className={`legacy-interface-cat-title${props.catId === catIdNum ? ' active' : ''}`}
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
                <span className="legacy-interface-cat-main">
                  <button
                    type="button"
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
                    aria-label={expanded ? '收起分类' : '展开分类'}
                    aria-expanded={expanded}
                  >
                    {expanded ? <DownOutlined /> : <RightOutlined />}
                  </button>
                  <span className="legacy-interface-cat-name">{cat.name}</span>
                </span>
                <Space size={4} className="legacy-interface-cat-actions">
                  {props.canEdit ? (
                    <>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onOpenAddInterfaceInCat(catIdNum);
                        }}
                        aria-label="在分类下新增接口"
                      >
                        <PlusOutlined />
                      </button>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onEditCat(cat);
                        }}
                        aria-label="编辑分类"
                      >
                        <EditOutlined />
                      </button>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onDeleteCat(cat);
                        }}
                        aria-label="删除分类"
                      >
                        <DeleteOutlined />
                      </button>
                    </>
                  ) : null}
                  <Tag>{cat.interface_count || cat.list?.length || 0}</Tag>
                </Space>
              </div>

              {shouldShowInterfaces && visibleInterfaces.length === 0 && catLoading ? (
                <div className="legacy-interface-tip">
                  加载接口中...
                </div>
              ) : null}
              {shouldShowInterfaces && visibleInterfaces.length === 0 && !catLoading ? (
                <div className="legacy-interface-tip">
                  暂无接口
                </div>
              ) : null}

              {visibleInterfaces.map(item => {
                const interfaceId = Number(item._id || 0);
                return (
                  <div
                    key={`iface-${item._id}`}
                    className={`legacy-interface-item${props.interfaceId === interfaceId ? ' active' : ''}`}
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
                    <Tooltip title={item.path}>
                      <span className="legacy-interface-item-title">
                        {item.title || item.path}
                      </span>
                    </Tooltip>
                    {props.canEdit ? (
                      <Space size={4} className="legacy-interface-item-actions">
                        <button
                          type="button"
                          className="legacy-interface-icon-btn"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onCopyInterface(item);
                          }}
                          aria-label="复制接口"
                        >
                          <CopyOutlined />
                        </button>
                        <button
                          type="button"
                          className="legacy-interface-icon-btn"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onDeleteInterface(interfaceId);
                          }}
                          aria-label="删除接口"
                        >
                          <DeleteOutlined />
                        </button>
                      </Space>
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
