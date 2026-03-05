import { Button, Input, Select, Space, Table, Tooltip, Typography, Alert } from 'antd';
import { CopyOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import { FilterBar } from '../../../components/layout/FilterBar';

const { Text } = Typography;

type InterfaceCategoryOption = {
  _id: number;
  name: string;
  desc?: string;
};

type InterfaceListPanelProps = {
  basepath?: string;
  canEdit: boolean;
  activeInterfaceId: number;
  currentCat: InterfaceCategoryOption | null;
  currentCatName: string;
  filteredList: LegacyInterfaceDTO[];
  currentListLoading: boolean;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  listPage: number;
  catOptions: Array<{ label: string; value: number }>;
  hasCategories: boolean;
  onListKeywordChange: (value: string) => void;
  onStatusFilterChange: (value: 'all' | 'done' | 'undone') => void;
  onResetFilters: () => void;
  onListPageChange: (page: number) => void;
  onOpenAddInterface: () => void;
  onOpenAddCat: () => void;
  onOpenEditCat: (cat: InterfaceCategoryOption) => void;
  onNavigateInterface: (id: number) => void;
  onUpdateStatus: (id: number, status: 'done' | 'undone') => Promise<void>;
  onUpdateCategory: (id: number, catid: number) => Promise<void>;
  onCopyInterface: (row: LegacyInterfaceDTO) => void;
  onDeleteInterface: (id: number) => void;
  methodClassName: (method?: string) => string;
};

export function InterfaceListPanel(props: InterfaceListPanelProps) {
  const tablePageSize = 20;
  const pagedFilteredList = props.filteredList.slice((props.listPage - 1) * tablePageSize, props.listPage * tablePageSize);
  const hasActiveFilters = props.listKeyword.trim().length > 0 || props.statusFilter !== 'all';

  return (
    <Space direction="vertical" className="legacy-interface-list-wrap">
      {props.currentCat ? (
        <Alert
          className="legacy-interface-cat-alert"
          type="info"
          showIcon
          message={`接口分类：${props.currentCat.name}`}
          description={
            <Space size={8}>
              <span>{props.currentCat.desc?.trim() || '暂无分类简介'}</span>
              {props.canEdit ? (
                <Button size="small" type="link" onClick={() => props.onOpenEditCat(props.currentCat as InterfaceCategoryOption)}>
                  编辑分类
                </Button>
              ) : null}
            </Space>
          }
        />
      ) : null}
      <FilterBar
        className="legacy-interface-list-toolbar"
        left={<Text strong>{props.currentCatName} 共 ({props.filteredList.length}) 个接口</Text>}
        right={
          <Space size={8}>
            <Input
              value={props.listKeyword}
              onChange={event => props.onListKeywordChange(event.target.value)}
              placeholder="搜索接口"
              prefix={<SearchOutlined />}
              allowClear
              className="legacy-interface-list-search"
            />
            <Select<'all' | 'done' | 'undone'>
              value={props.statusFilter}
              onChange={props.onStatusFilterChange}
              className="legacy-interface-list-status-filter"
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'done', label: '已完成' },
                { value: 'undone', label: '未完成' }
              ]}
            />
            <Button onClick={props.onResetFilters} disabled={!hasActiveFilters}>
              清空筛选
            </Button>
            {props.canEdit ? (
              <>
                <Button onClick={props.onOpenAddInterface} disabled={!props.hasCategories}>
                  添加接口
                </Button>
                <Button onClick={props.onOpenAddCat}>
                  添加分类
                </Button>
              </>
            ) : null}
          </Space>
        }
      />

      <Table<LegacyInterfaceDTO>
        rowKey={row => Number(row._id || 0)}
        loading={props.currentListLoading}
        dataSource={pagedFilteredList}
        rowClassName={row => (Number(row._id || 0) === props.activeInterfaceId ? 'legacy-interface-list-row-active' : '')}
        onRow={row => ({
          onClick: () => props.onNavigateInterface(Number(row._id || 0))
        })}
        locale={{
          emptyText:
            props.filteredList.length === 0 && !props.listKeyword.trim() && props.statusFilter === 'all' ? (
              <LegacyErrMsg type="noInterface" />
            ) : (
              <LegacyErrMsg type="noData" />
            )
        }}
        pagination={{
          current: props.listPage,
          pageSize: tablePageSize,
          total: props.filteredList.length,
          showSizeChanger: false,
          onChange: page => props.onListPageChange(page)
        }}
        columns={[
          {
            title: '接口名称',
            dataIndex: 'title',
            render: (value, row) => (
              <button
                type="button"
                className="legacy-interface-menu-link-btn"
                onClick={() => props.onNavigateInterface(Number(row._id || 0))}
              >
                {value}
              </button>
            )
          },
          {
            title: '接口路径',
            dataIndex: 'path',
            render: (value, row) => (
              <Space>
                <span className={props.methodClassName(String(row.method || 'GET'))}>
                  {String(row.method || 'GET').toUpperCase()}
                </span>
                {row.api_opened ? (
                  <Tooltip title="开放接口">
                    <EyeOutlined className="legacy-opened-icon" />
                  </Tooltip>
                ) : null}
                <span className="legacy-interface-path-text">{`${props.basepath || ''}${value || ''}`}</span>
              </Space>
            )
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 140,
            render: (value, row) => (
              <div
                onClick={event => event.stopPropagation()}
                onMouseDown={event => event.stopPropagation()}
              >
                <Select<'done' | 'undone'>
                  value={String(value || 'undone') as 'done' | 'undone'}
                  className="legacy-interface-status-select"
                  disabled={!props.canEdit}
                  onChange={next => props.onUpdateStatus(Number(row._id || 0), next)}
                  options={[
                    { label: '已完成', value: 'done' },
                    { label: '未完成', value: 'undone' }
                  ]}
                />
              </div>
            )
          },
          {
            title: '分类',
            width: 220,
            render: (_, row) => (
              <div
                onClick={event => event.stopPropagation()}
                onMouseDown={event => event.stopPropagation()}
              >
                <Select<number>
                  value={Number(row.catid || 0)}
                  className="legacy-interface-catid-select"
                  disabled={!props.canEdit}
                  onChange={nextCatId => props.onUpdateCategory(Number(row._id || 0), nextCatId)}
                  options={props.catOptions}
                />
              </div>
            )
          },
          {
            title: '操作',
            width: 130,
            render: (_, row) =>
              props.canEdit ? (
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={event => {
                      event.stopPropagation();
                      props.onCopyInterface(row);
                    }}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={event => {
                      event.stopPropagation();
                      props.onDeleteInterface(Number(row._id || 0));
                    }}
                  />
                </Space>
              ) : (
                '-'
              )
          }
        ]}
      />
    </Space>
  );
}
