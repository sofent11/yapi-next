import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Table,
  TextInput
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Link, useNavigate } from 'react-router-dom';
import { AppEmptyState } from '../components/AppEmptyState';
import { AdaptiveDataView } from '../components/patterns/AdaptiveDataView';
import { AsyncState } from '../components/patterns/AsyncState';
import { DataPagination } from '../components/patterns/DataPagination';
import { DataToolbar } from '../components/patterns/DataToolbar';
import {
  useDeleteUserMutation,
  useGetUserListQuery,
  useGetUserStatusQuery,
  useLazySearchUsersQuery
} from '../services/yapi-api';
import { PageHeader, SectionCard } from '../components/layout';

type UserRow = Record<string, unknown> & {
  _id?: number;
  uid?: number;
  username?: string;
  email?: string;
  role?: string;
  add_time?: number;
  up_time?: number;
  type?: string;
  key?: number;
};

function showError(message: string) {
  notifications.show({ color: 'red', message });
}

function showSuccess(message: string) {
  notifications.show({ color: 'teal', message });
}

function formatTime(value: unknown) {
  return value ? new Date(Number(value) * 1000).toLocaleString() : '-';
}

function getUserId(row: UserRow) {
  return Number(row._id || row.uid || 0);
}

export function UserListPage() {
  const navigate = useNavigate();
  const statusQuery = useGetUserStatusQuery();
  const currentUid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);
  const currentRole = statusQuery.data?.data?.role || 'member';
  const isAdmin = currentRole === 'admin';

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [searchRows, setSearchRows] = useState<UserRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const userListQuery = useGetUserListQuery(
    { page, limit },
    { skip: !isAdmin }
  );
  const [searchUsers, searchUsersState] = useLazySearchUsersQuery();
  const [deleteUser, deleteUserState] = useDeleteUserMutation();

  const tableRows = useMemo<UserRow[]>(() => {
    if (isSearching) {
      return searchRows.map(item => ({
        ...item,
        _id: Number(item.uid || item._id || 0),
        key: Number(item.uid || item._id || 0)
      }));
    }
    return (userListQuery.data?.data?.list || []).map(item => ({
      ...item,
      key: Number(item._id || item.uid || 0)
    })) as UserRow[];
  }, [isSearching, searchRows, userListQuery.data]);

  const totalUsers = Number(userListQuery.data?.data?.count || tableRows.length || 0);
  const totalPages = Math.max(1, Math.ceil(totalUsers / limit));
  const listLoading = userListQuery.isLoading || searchUsersState.isFetching;

  async function handleSearch() {
    const q = keyword.trim();
    if (!q) {
      setIsSearching(false);
      setSearchRows([]);
      return;
    }
    const response = await searchUsers({ q }).unwrap();
    if (response.errcode !== 0) {
      showError(response.errmsg || '搜索失败');
      return;
    }
    setSearchRows((response.data || []) as UserRow[]);
    setIsSearching(true);
  }

  async function handleDelete(uid: number) {
    const response = await deleteUser({ id: uid }).unwrap();
    if (response.errcode !== 0) {
      showError(response.errmsg || '删除失败');
      return;
    }
    showSuccess('已删除此用户');
    await userListQuery.refetch();
  }

  function confirmDelete(uid: number) {
    modals.openConfirmModal({
      title: '确认删除此用户？',
      labels: { confirm: '确定', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => void handleDelete(uid)
    });
  }

  return (
    <div className="page-shell user-page">
      <PageHeader
        eyebrow="组织管理"
        title="用户管理"
        subtitle={isAdmin ? `当前共有 ${totalUsers} 位用户` : '当前账号权限受限，仅可查看个人中心。'}
        meta={isAdmin ? '支持按用户名或邮箱快速检索并维护用户资料。' : '当前仅开放个人资料查看入口。'}
        actions={
          currentUid > 0 ? (
            <Button variant="default" onClick={() => navigate(`/user/profile/${currentUid}`)}>
              个人中心
            </Button>
          ) : null
        }
      />

      <SectionCard className="user-list-card">
        <DataToolbar
          title={`用户列表 (${totalUsers})`}
          summary={isAdmin ? '支持按用户名或邮箱快速检索，并在桌面和移动端查看统一结果。' : '当前账号仅可进入个人中心查看资料。'}
          className="user-search-bar"
          actions={
            <div className="flex w-full flex-col gap-3 md:flex-row md:justify-end">
              {isAdmin ? (
                <>
                  <TextInput
                    className="w-full md:max-w-xl"
                    value={keyword}
                    onChange={event => setKeyword(event.currentTarget.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSearch();
                      }
                    }}
                    placeholder="输入用户名或邮箱搜索…"
                    aria-label="按用户名或邮箱搜索用户"
                  />
                  <Button onClick={() => void handleSearch()} loading={searchUsersState.isFetching}>
                    搜索
                  </Button>
                </>
              ) : null}
              {isSearching ? (
                <Button
                  variant="default"
                  onClick={() => {
                    setKeyword('');
                    setIsSearching(false);
                    setSearchRows([]);
                  }}
                >
                  清空搜索
                </Button>
              ) : null}
            </div>
          }
        />

        {!isAdmin ? (
          <Alert color="yellow" title="仅管理员可查看完整用户列表" className="mb-4">
            <Link to={`/user/profile/${currentUid}`}>进入个人中心</Link>
          </Alert>
        ) : null}

        {listLoading && tableRows.length === 0 ? (
          <AsyncState state="loading" title="正在加载用户列表" description="用户资料和检索结果正在准备中。" />
        ) : tableRows.length === 0 ? (
          <AppEmptyState type="noData" title={isSearching ? '没有匹配的用户' : '暂无用户数据'} desc={isSearching ? '试试更换用户名、邮箱关键词，或清空搜索后重试。' : '当前还没有可展示的用户记录。'} />
        ) : (
          <AdaptiveDataView
            desktop={
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[var(--border-project-subtle)]">
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>用户名</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>角色</Table.Th>
                      <Table.Th>更新时间</Table.Th>
                      {isAdmin ? <Table.Th className="text-center">操作</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {tableRows.map(row => (
                      <Table.Tr key={row.key || getUserId(row)}>
                        <Table.Td>
                          <Link to={`/user/profile/${getUserId(row)}`}>{String(row.username || '-')}</Link>
                        </Table.Td>
                        <Table.Td>{String(row.email || '-')}</Table.Td>
                        <Table.Td>{String(row.role || '-')}</Table.Td>
                        <Table.Td>{formatTime(row.up_time)}</Table.Td>
                        {isAdmin ? (
                          <Table.Td>
                            <div className="flex justify-center">
                              <Button
                                variant="subtle"
                                color="red"
                                size="compact-sm"
                                onClick={() => confirmDelete(getUserId(row))}
                                loading={deleteUserState.isLoading}
                              >
                                删除
                              </Button>
                            </div>
                          </Table.Td>
                        ) : null}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            }
            mobile={
              <div className="adaptive-data-view-mobile">
                {tableRows.map(row => (
                  <div key={row.key || getUserId(row)} className="adaptive-data-card">
                    <div className="adaptive-data-card-head">
                      <div className="min-w-0">
                        <Link className="truncate font-medium text-slate-900 dark:text-slate-100" to={`/user/profile/${getUserId(row)}`}>
                          {String(row.username || '-')}
                        </Link>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{String(row.email || '-')}</div>
                      </div>
                    </div>
                    <div className="adaptive-data-card-grid">
                      <div>
                        <span className="adaptive-data-card-label">角色</span>
                        <span>{String(row.role || '-')}</span>
                      </div>
                      <div>
                        <span className="adaptive-data-card-label">更新时间</span>
                        <span>{formatTime(row.up_time)}</span>
                      </div>
                    </div>
                    {isAdmin ? (
                      <div className="adaptive-data-card-actions">
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => confirmDelete(getUserId(row))}
                          loading={deleteUserState.isLoading}
                        >
                          删除
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            }
          />
        )}

        {!isSearching && isAdmin ? (
          <DataPagination
            page={page}
            totalPages={totalPages}
            totalItems={totalUsers}
            itemLabel="用户"
            onPageChange={setPage}
          />
        ) : null}
      </SectionCard>
    </div>
  );
}
