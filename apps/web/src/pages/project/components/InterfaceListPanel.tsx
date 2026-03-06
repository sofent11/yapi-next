import { Alert, Badge, Button, Select, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCopy, IconEye, IconSearch, IconTrash } from '@tabler/icons-react';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import { FilterBar } from '../../../components/layout/FilterBar';

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
  const totalPages = Math.max(1, Math.ceil(props.filteredList.length / tablePageSize));

  return (
    <div className="interface-table-panel space-y-4">
      {props.currentCat ? (
        <Alert
          className="interface-category-alert"
          color="blue"
          title={`接口分类：${props.currentCat.name}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span>{props.currentCat.desc?.trim() || '暂无分类简介'}</span>
            {props.canEdit ? (
              <Button size="compact-sm" variant="subtle" onClick={() => props.onOpenEditCat(props.currentCat as InterfaceCategoryOption)}>
                编辑分类
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      <FilterBar
        className="interface-table-toolbar"
        left={
          <div className="interface-table-toolbar-copy">
            <Text fw={700}>{props.currentCatName}</Text>
            <Text c="dimmed">{`${props.filteredList.length} 个接口`}</Text>
          </div>
        }
        right={
          <div className="flex flex-wrap gap-2">
            <TextInput
              value={props.listKeyword}
              onChange={event => props.onListKeywordChange(event.currentTarget.value)}
              placeholder="按名称或路径搜索接口…"
              leftSection={<IconSearch size={16} />}
              className="interface-table-search min-w-[240px]"
              aria-label="搜索接口"
            />
            <Select
              value={props.statusFilter}
              onChange={value => props.onStatusFilterChange((value as 'all' | 'done' | 'undone') || 'all')}
              className="interface-table-status-filter min-w-[150px]"
              aria-label="按状态筛选接口"
              data={[
                { value: 'all', label: '全部状态' },
                { value: 'done', label: '已完成' },
                { value: 'undone', label: '未完成' }
              ]}
            />
            <Button variant="default" onClick={props.onResetFilters} disabled={!hasActiveFilters}>
              清空筛选
            </Button>
            {props.canEdit ? (
              <>
                <Button onClick={props.onOpenAddInterface} disabled={!props.hasCategories}>
                  添加接口
                </Button>
                <Button variant="default" onClick={props.onOpenAddCat}>
                  添加分类
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {props.filteredList.length === 0 ? (
        props.filteredList.length === 0 && !props.listKeyword.trim() && props.statusFilter === 'all' ? (
          <LegacyErrMsg type="noInterface" />
        ) : (
          <LegacyErrMsg type="noData" />
        )
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <Table withTableBorder striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>接口名称</Table.Th>
                <Table.Th>接口路径</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>分类</Table.Th>
                <Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedFilteredList.map(row => (
                <Table.Tr
                  key={Number(row._id || 0)}
                  className={Number(row._id || 0) === props.activeInterfaceId ? 'interface-table-row-active' : undefined}
                  onClick={() => props.onNavigateInterface(Number(row._id || 0))}
                >
                  <Table.Td>
                    <button
                      type="button"
                      className="interface-link-button"
                      onClick={() => props.onNavigateInterface(Number(row._id || 0))}
                    >
                      {row.title}
                    </button>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={props.methodClassName(String(row.method || 'GET'))}>
                        {String(row.method || 'GET').toUpperCase()}
                      </span>
                      {row.api_opened ? (
                        <Tooltip label="开放接口">
                          <span className="inline-flex"><IconEye size={16} className="interface-opened-icon" /></span>
                        </Tooltip>
                      ) : null}
                      <span className="interface-path-text">{`${props.basepath || ''}${row.path || ''}`}</span>
                    </div>
                  </Table.Td>
                  <Table.Td onClick={event => event.stopPropagation()}>
                    <Select
                      value={String(row.status || 'undone')}
                      className="interface-table-status-select min-w-[120px]"
                      disabled={!props.canEdit}
                      onChange={next => next && props.onUpdateStatus(Number(row._id || 0), next as 'done' | 'undone')}
                      data={[
                        { label: '已完成', value: 'done' },
                        { label: '未完成', value: 'undone' }
                      ]}
                    />
                  </Table.Td>
                  <Table.Td onClick={event => event.stopPropagation()}>
                    <Select
                      value={String(Number(row.catid || 0))}
                      className="interface-table-category-select min-w-[180px]"
                      disabled={!props.canEdit}
                      onChange={nextCatId => nextCatId && props.onUpdateCategory(Number(row._id || 0), Number(nextCatId))}
                      data={props.catOptions.map(option => ({ label: option.label, value: String(option.value) }))}
                    />
                  </Table.Td>
                  <Table.Td onClick={event => event.stopPropagation()}>
                    {props.canEdit ? (
                      <div className="flex gap-2">
                        <Button size="compact-sm" variant="default" onClick={() => props.onCopyInterface(row)}>
                          <IconCopy size={14} />
                        </Button>
                        <Button size="compact-sm" color="red" variant="light" onClick={() => props.onDeleteInterface(Number(row._id || 0))}>
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="light">只读</Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {props.filteredList.length > tablePageSize ? (
        <div className="flex items-center justify-between gap-3">
          <Text size="sm" c="dimmed">
            第 {props.listPage} / {totalPages} 页，共 {props.filteredList.length} 个接口
          </Text>
          <div className="flex gap-2">
            <Button
              variant="default"
              disabled={props.listPage <= 1}
              onClick={() => props.onListPageChange(props.listPage - 1)}
            >
              上一页
            </Button>
            <Button
              variant="default"
              disabled={props.listPage >= totalPages}
              onClick={() => props.onListPageChange(props.listPage + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
