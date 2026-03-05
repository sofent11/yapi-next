import { Button, Input, Select, Space, Table, Tooltip, Typography, Alert } from 'antd';
import { CopyOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import type { CSSProperties } from 'react';
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
  onListPageChange: (page: number) => void;
  onOpenAddInterface: () => void;
  onOpenAddCat: () => void;
  onOpenEditCat: (cat: InterfaceCategoryOption) => void;
  onNavigateInterface: (id: number) => void;
  onUpdateStatus: (id: number, status: 'done' | 'undone') => Promise<void>;
  onUpdateCategory: (id: number, catid: number) => Promise<void>;
  onCopyInterface: (row: LegacyInterfaceDTO) => void;
  onDeleteInterface: (id: number) => void;
  methodStyle: (method: string) => CSSProperties;
};

export function InterfaceListPanel(props: InterfaceListPanelProps) {
  const tablePageSize = 20;
  const pagedFilteredList = props.filteredList.slice((props.listPage - 1) * tablePageSize, props.listPage * tablePageSize);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {props.currentCat ? (
        <Alert
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
              style={{ width: 260 }}
            />
            <Select<'all' | 'done' | 'undone'>
              value={props.statusFilter}
              onChange={props.onStatusFilterChange}
              style={{ width: 124 }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'done', label: '已完成' },
                { value: 'undone', label: '未完成' }
              ]}
            />
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
                <span className="legacy-method-pill" style={props.methodStyle(String(row.method || 'GET'))}>
                  {String(row.method || 'GET').toUpperCase()}
                </span>
                {row.api_opened ? (
                  <Tooltip title="开放接口">
                    <EyeOutlined className="legacy-opened-icon" />
                  </Tooltip>
                ) : null}
                <span>{`${props.basepath || ''}${value || ''}`}</span>
              </Space>
            )
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 140,
            render: (value, row) => (
              <Select<'done' | 'undone'>
                value={String(value || 'undone') as 'done' | 'undone'}
                style={{ width: 120 }}
                disabled={!props.canEdit}
                onChange={next => props.onUpdateStatus(Number(row._id || 0), next)}
                options={[
                  { label: '已完成', value: 'done' },
                  { label: '未完成', value: 'undone' }
                ]}
              />
            )
          },
          {
            title: '分类',
            width: 220,
            render: (_, row) => (
              <Select<number>
                value={Number(row.catid || 0)}
                style={{ width: 200 }}
                disabled={!props.canEdit}
                onChange={nextCatId => props.onUpdateCategory(Number(row._id || 0), nextCatId)}
                options={props.catOptions}
              />
            )
          },
          {
            title: '操作',
            width: 130,
            render: (_, row) =>
              props.canEdit ? (
                <Space size={4}>
                  <Button icon={<CopyOutlined />} onClick={() => props.onCopyInterface(row)} />
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => props.onDeleteInterface(Number(row._id || 0))}
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
