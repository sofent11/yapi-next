import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  PasswordInput,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppEmptyState } from '../components/AppEmptyState';
import { AdaptiveDataView } from '../components/patterns/AdaptiveDataView';
import { AsyncState } from '../components/patterns/AsyncState';
import { DataPagination } from '../components/patterns/DataPagination';
import { DataToolbar } from '../components/patterns/DataToolbar';
import { InfoGrid, InfoGridItem } from '../components/patterns/InfoGrid';
import {
  useChangePasswordMutation,
  useDeleteUserMutation,
  useGetUserListQuery,
  useGetUserStatusQuery,
  useLazyFindUserQuery,
  useLazySearchUsersQuery,
  useUpdateUserMutation,
  useUploadAvatarMutation
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

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

export function UserPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ uid?: string }>();

  const statusQuery = useGetUserStatusQuery();
  const currentUid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);
  const currentRole = statusQuery.data?.data?.role || 'member';
  const routeUid = Number(params.uid || 0);
  const isProfilePath = location.pathname.startsWith('/user/profile');
  const targetUid = routeUid > 0 ? routeUid : isProfilePath ? currentUid : 0;
  const inProfile = isProfilePath;
  const isAdmin = currentRole === 'admin';

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [searchRows, setSearchRows] = useState<UserRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<'admin' | 'member'>('member');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const userListQuery = useGetUserListQuery(
    { page, limit },
    { skip: inProfile || !isAdmin }
  );
  const [searchUsers, searchUsersState] = useLazySearchUsersQuery();
  const [findUser, findUserState] = useLazyFindUserQuery();
  const [updateUser, updateUserState] = useUpdateUserMutation();
  const [deleteUser, deleteUserState] = useDeleteUserMutation();
  const [changePassword, changePasswordState] = useChangePasswordMutation();
  const [uploadAvatar] = useUploadAvatarMutation();

  useEffect(() => {
    if (location.pathname === '/user' || location.pathname === '/user/') {
      navigate('/user/list', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!inProfile || targetUid <= 0) return;
    void findUser({ id: targetUid });
  }, [findUser, inProfile, targetUid]);

  const profileData = useMemo(() => {
    return (findUserState.data?.data || null) as UserRow | null;
  }, [findUserState.data]);

  useEffect(() => {
    if (!profileData) return;
    setUsernameInput(String(profileData.username || ''));
    setEmailInput(String(profileData.email || ''));
    setRoleInput((profileData.role as 'admin' | 'member') || 'member');
  }, [profileData]);

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

  const canEditBasic = isAdmin || currentUid === targetUid;
  const canEditRole = isAdmin;
  const canChangePassword = canEditBasic && (profileData?.type || 'site') === 'site';
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

  async function handleSaveProfile() {
    if (targetUid <= 0) {
      showError('无效用户');
      return;
    }
    const response = await updateUser({
      uid: targetUid,
      username: usernameInput.trim() || undefined,
      email: emailInput.trim() || undefined,
      role: canEditRole ? roleInput : undefined
    }).unwrap();
    if (response.errcode !== 0) {
      showError(response.errmsg || '更新失败');
      return;
    }
    showSuccess('更新成功');
    await Promise.all([findUser({ id: targetUid }), userListQuery.refetch(), statusQuery.refetch()]);
  }

  async function handleChangePassword() {
    if (targetUid <= 0) {
      showError('无效用户');
      return;
    }
    if (!newPassword) {
      showError('请输入新密码');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    const response = await changePassword({
      uid: targetUid,
      old_password: oldPassword || undefined,
      password: newPassword
    }).unwrap();
    if (response.errcode !== 0) {
      showError(response.errmsg || '修改密码失败');
      return;
    }
    showSuccess('密码修改成功');
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleAvatarUpload(file?: File | null) {
    if (!file || targetUid !== currentUid) return;

    const isJpg = file.type === 'image/jpeg';
    const isPng = file.type === 'image/png';
    if (!isJpg && !isPng) {
      showError('图片格式仅支持 jpg/png');
      return;
    }
    if (file.size / 1024 / 1024 >= 0.2) {
      showError('图片必须小于 200kb');
      return;
    }

    const basecode = await fileToBase64(file);
    const response = await uploadAvatar({ basecode }).unwrap();
    if (response.errcode !== 0) {
      showError(response.errmsg || '上传头像失败');
      return;
    }
    showSuccess('头像已更新');
    await statusQuery.refetch();
  }

  if (!inProfile) {
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
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
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
                          <Link className="truncate font-medium text-slate-900" to={`/user/profile/${getUserId(row)}`}>
                            {String(row.username || '-')}
                          </Link>
                          <div className="text-sm text-slate-500">{String(row.email || '-')}</div>
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

  if (findUserState.isFetching && !profileData) {
    return (
      <div className="page-shell user-page">
        <PageHeader
          eyebrow="个人资料"
          title={targetUid === currentUid ? '个人设置' : `用户 ${targetUid} 资料设置`}
          subtitle="正在加载用户信息..."
          actions={
            <Button variant="default" onClick={() => navigate('/user/list')}>
              返回用户列表
            </Button>
          }
        />
        <AsyncState state="loading" title="正在加载用户资料" description="基础信息、头像和账号状态正在准备中。" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="page-shell user-page">
        <PageHeader
          eyebrow="个人资料"
          title="用户资料不可用"
          subtitle="当前用户不存在，或你没有权限查看该资料。"
          actions={
            <Button variant="default" onClick={() => navigate('/user/list')}>
              返回用户列表
            </Button>
          }
        />
        <AsyncState state="empty" title="未找到用户资料" description="请检查用户 ID 是否正确，或返回列表重新选择用户。" />
      </div>
    );
  }

  return (
    <div className="page-shell user-page">
      <PageHeader
        eyebrow="个人资料"
        title={targetUid === currentUid ? '个人设置' : `${profileData.username || targetUid} 资料设置`}
        subtitle="可在此更新基础资料、头像和密码。"
        meta={profileData.email ? `当前邮箱 ${profileData.email}` : undefined}
        actions={
          <Button variant="default" onClick={() => navigate('/user/list')}>
            返回用户列表
          </Button>
        }
      />

      <SectionCard className="user-profile-card">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-center">
              {targetUid === currentUid ? (
                <Tooltip label="点击头像更换，仅支持 jpg/png 且大小不超过 200kb。">
                  <label htmlFor="avatar-upload-input" className="cursor-pointer">
                    <img
                      className="h-24 w-24 rounded-full border border-slate-200 object-cover"
                      src={`/api/user/avatar?uid=${targetUid}`}
                      alt="avatar"
                    />
                  </label>
                </Tooltip>
              ) : (
                <img
                  className="h-24 w-24 rounded-full border border-slate-200 object-cover"
                  src={`/api/user/avatar?uid=${targetUid}`}
                  alt="avatar"
                />
              )}
              <input
                id="avatar-upload-input"
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  void handleAvatarUpload(file);
                  event.currentTarget.value = '';
                }}
              />
              {targetUid === currentUid ? (
                <Text size="sm" c="dimmed">
                  点击头像更换
                </Text>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <Text fw={600} mb="md">
                账号摘要
              </Text>
              <InfoGrid>
                <InfoGridItem label="用户 ID" value={targetUid || '-'} />
                <InfoGridItem label="登录方式" value={profileData.type === 'site' ? '站点登录' : '第三方登录'} />
                <InfoGridItem label="创建时间" value={formatTime(profileData.add_time)} />
                <InfoGridItem label="更新时间" value={formatTime(profileData.up_time)} />
              </InfoGrid>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <Text fw={600}>基础资料</Text>
              <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center">
                <Text fw={500}>用户名</Text>
                <TextInput
                  aria-label="用户名"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.currentTarget.value)}
                  disabled={!canEditBasic}
                  placeholder="请输入用户名…"
                  spellCheck={false}
                />
                {canEditBasic ? (
                  <Button onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                    更新
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center">
                <Text fw={500}>Email</Text>
                <TextInput
                  aria-label="邮箱"
                  type="email"
                  inputMode="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.currentTarget.value)}
                  disabled={!canEditBasic}
                  placeholder="例如：name@example.com…"
                  spellCheck={false}
                />
                {canEditBasic ? (
                  <Button onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                    更新
                  </Button>
                ) : null}
              </div>

              {isAdmin ? (
                <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center">
                  <Text fw={500}>角色</Text>
                  <Select
                    value={roleInput}
                    onChange={value => setRoleInput((value as 'admin' | 'member') || 'member')}
                    disabled={!canEditRole}
                    data={[
                      { value: 'admin', label: '管理员' },
                      { value: 'member', label: '会员' }
                    ]}
                  />
                  {canEditRole ? (
                    <Button onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                      更新
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canChangePassword ? (
              <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <Text fw={600}>修改密码</Text>
                {isAdmin && profileData?.role !== 'admin' ? null : (
                  <PasswordInput
                    id="old_password"
                    value={oldPassword}
                    onChange={event => setOldPassword(event.currentTarget.value)}
                    placeholder="请输入旧密码…"
                  />
                )}
                <PasswordInput
                  id="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.currentTarget.value)}
                  placeholder="请输入新密码…"
                />
                <PasswordInput
                  id="verify_pass"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.currentTarget.value)}
                  placeholder="请再次输入新密码…"
                />
                <Button
                  onClick={() => void handleChangePassword()}
                  loading={changePasswordState.isLoading}
                  disabled={!canChangePassword}
                >
                  确定修改
                </Button>
              </div>
            ) : (
              <Alert color="blue" title="密码管理" className="project-settings-info-alert">
                当前账号为第三方登陆，不支持站内密码修改。
              </Alert>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
