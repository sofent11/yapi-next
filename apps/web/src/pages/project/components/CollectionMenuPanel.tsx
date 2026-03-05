import { Button, Input, Space, Tag, Tooltip } from 'antd';
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
      <div className="legacy-interface-menu-list">
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
              <button
                type="button"
                className={`legacy-interface-cat-title${activeCol ? ' active' : ''}`}
                draggable={props.colDragEnabled}
                onDragStart={event => {
                  if (!props.colDragEnabled) return;
                  props.onDragStartCol(colId);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={props.onDragEnd}
                onClick={() => props.onNavigateCol(colId)}
              >
                <span className="legacy-interface-cat-main">
                  <span
                    className="legacy-interface-cat-toggle"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (keywordMode) return;
                      props.onToggleExpandCol(colId);
                    }}
                  >
                    {expanded ? <DownOutlined /> : <RightOutlined />}
                  </span>
                  <FolderOpenOutlined style={{ color: '#617184' }} />
                  <span className="legacy-interface-cat-name">{String(col.name || '')}</span>
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
                          props.onDeleteCol(colId);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onDeleteCol(colId))
                        }
                      >
                        <DeleteOutlined />
                      </span>
                      <span
                        className="legacy-interface-icon-btn"
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onEditCol(col);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onEditCol(col))
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
                          props.onImportCol(colId);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onImportCol(colId))
                        }
                      >
                        <ImportOutlined />
                      </span>
                      <span
                        className="legacy-interface-icon-btn"
                        role="button"
                        tabIndex={0}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onCopyCol(col);
                        }}
                        onKeyDown={event =>
                          triggerWithKeyboard(event, () => props.onCopyCol(col))
                        }
                      >
                        <CopyOutlined />
                      </span>
                    </>
                  ) : null}
                  <Tag>{caseList.length}</Tag>
                </Space>
              </button>
              {(expanded ? caseList : []).map(item => {
                const id = String(item._id || '');
                return (
                  <button
                    key={`case-${id}`}
                    type="button"
                    className={`legacy-interface-item${props.action === 'case' && props.caseId === id ? ' active' : ''}`}
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
                  >
                    <Tag color="blue">CASE</Tag>
                    <Tooltip title={String(item.path || '')}>
                      <span className="legacy-interface-item-title">{String(item.casename || item.title || id)}</span>
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
                            props.onDeleteCase(id);
                          }}
                          onKeyDown={event =>
                            triggerWithKeyboard(event, () => props.onDeleteCase(id))
                          }
                        >
                          <DeleteOutlined />
                        </span>
                        <span
                          className="legacy-interface-icon-btn"
                          role="button"
                          tabIndex={0}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onCopyCase(id);
                          }}
                          onKeyDown={event =>
                            triggerWithKeyboard(event, () => props.onCopyCase(id))
                          }
                        >
                          <CopyOutlined />
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
