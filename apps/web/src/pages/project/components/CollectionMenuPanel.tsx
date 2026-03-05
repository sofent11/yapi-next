import { Button, Empty, Input, Space, Tag, Tooltip, Typography } from 'antd';
import type { KeyboardEvent } from 'react';
import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { FilterBar } from '../../../components/layout';
const { Text } = Typography;

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
              value={props.colKeyword}
              onChange={event => props.onColKeywordChange(event.target.value)}
              placeholder="搜索测试集合"
              prefix={<SearchOutlined />}
              allowClear
              className="legacy-interface-filter-input"
            />
          }
          right={
            props.canEdit ? (
              <Space className="legacy-interface-filter-actions" size={8}>
                <Button type="primary" icon={<PlusOutlined />} onClick={props.onOpenAddCol}>
                  添加集合
                </Button>
              </Space>
            ) : null
          }
        />
      </div>
      <div className="legacy-interface-menu-summary">
        <Text type="secondary">
          {keywordMode ? '筛选结果：' : ''}
          {props.colDisplayRows.length} 个集合，{totalCases} 个用例
        </Text>
      </div>
      <div className="legacy-interface-menu-list">
        {props.colDisplayRows.length === 0 ? (
          <div className="legacy-interface-menu-empty">
            <Empty description={keywordMode ? '未找到匹配的测试集合' : '暂无测试集合'}>
              {!keywordMode && props.canEdit ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={props.onOpenAddCol}>
                  新建集合
                </Button>
              ) : null}
            </Empty>
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
              className="legacy-interface-cat"
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
                className={`legacy-interface-cat-title${activeCol ? ' active' : ''}`}
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
                <span className="legacy-interface-cat-main">
                  <button
                    type="button"
                    className="legacy-interface-cat-toggle"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (keywordMode) return;
                      props.onToggleExpandCol(colId);
                    }}
                    aria-label={expanded ? '收起集合' : '展开集合'}
                    aria-expanded={expanded}
                  >
                    {expanded ? <DownOutlined /> : <RightOutlined />}
                  </button>
                  <FolderOpenOutlined className="legacy-interface-cat-folder" />
                  <span className="legacy-interface-cat-name">{String(col.name || '')}</span>
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
                          props.onDeleteCol(colId);
                        }}
                        aria-label="删除集合"
                      >
                        <DeleteOutlined />
                      </button>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onEditCol(col);
                        }}
                        aria-label="编辑集合"
                      >
                        <EditOutlined />
                      </button>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onImportCol(colId);
                        }}
                        aria-label="导入接口"
                      >
                        <ImportOutlined />
                      </button>
                      <button
                        type="button"
                        className="legacy-interface-icon-btn"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onCopyCol(col);
                        }}
                        aria-label="复制集合"
                      >
                        <CopyOutlined />
                      </button>
                    </>
                  ) : null}
                  <Tag>{caseList.length}</Tag>
                </Space>
              </div>
              {(expanded ? caseList : []).map(item => {
                const id = String(item._id || '');
                return (
                  <div
                    key={`case-${id}`}
                    className={`legacy-interface-item${props.action === 'case' && props.caseId === id ? ' active' : ''}`}
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
                    <Tag color="blue">CASE</Tag>
                    <Tooltip title={String(item.path || '')}>
                      <span className="legacy-interface-item-title">{String(item.casename || item.title || id)}</span>
                    </Tooltip>
                    {props.canEdit ? (
                      <Space size={4} className="legacy-interface-item-actions">
                        <button
                          type="button"
                          className="legacy-interface-icon-btn"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onDeleteCase(id);
                          }}
                          aria-label="删除用例"
                        >
                          <DeleteOutlined />
                        </button>
                        <button
                          type="button"
                          className="legacy-interface-icon-btn"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onCopyCase(id);
                          }}
                          aria-label="复制用例"
                        >
                          <CopyOutlined />
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
