import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  PasswordInput,
  Select,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate, useParams } from 'react-router-dom';
import { AsyncState } from '../components/patterns/AsyncState';
import { InfoGrid, InfoGridItem } from '../components/patterns/InfoGrid';
import {
  useChangePasswordMutation,
  useGetUserStatusQuery,
  useLazyFindUserQuery,
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

export function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams<{ uid?: string }>();

  const statusQuery = useGetUserStatusQuery();
  const currentUid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);
  const currentRole = statusQuery.data?.data?.role || 'member';
  const routeUid = Number(params.uid || 0);
  const targetUid = routeUid > 0 ? routeUid : currentUid;
  const isAdmin = currentRole === 'admin';

  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<'admin' | 'member'>('member');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [findUser, findUserState] = useLazyFindUserQuery();
  const [updateUser, updateUserState] = useUpdateUserMutation();
  const [changePassword, changePasswordState] = useChangePasswordMutation();
  const [uploadAvatar] = useUploadAvatarMutation();

  useEffect(() => {
    if (targetUid <= 0) return;
    void findUser({ id: targetUid });
  }, [findUser, targetUid]);

  const profileData = useMemo(() => {
    return (findUserState.data?.data || null) as UserRow | null;
  }, [findUserState.data]);

  useEffect(() => {
    if (!profileData) return;
    setUsernameInput(String(profileData.username || ''));
    setEmailInput(String(profileData.email || ''));
    setRoleInput((profileData.role as 'admin' | 'member') || 'member');
  }, [profileData]);

  const canEditBasic = isAdmin || currentUid === targetUid;
  const canEditRole = isAdmin;
  const canChangePassword = canEditBasic && (profileData?.type || 'site') === 'site';
  const avatarAlt = `${String(profileData?.username || profileData?.email || targetUid)} 的头像`;
  const insetPanelClassName =
    'rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-5 text-[var(--text-primary)]';
  const avatarPanelClassName = `${insetPanelClassName} flex flex-col items-center gap-3 p-6 text-center`;
  const avatarImageClassName =
    'h-24 w-24 rounded-full border border-[var(--border-subtle)] object-cover';

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
    await Promise.all([findUser({ id: targetUid }), statusQuery.refetch()]);
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

  if (findUserState.isFetching && !profileData) {
    return (
      <div className="page-shell user-page">
        <PageHeader
          eyebrow="个人资料"
          title={targetUid === currentUid ? '个人设置' : `用户 ${targetUid} 资料设置`}
          subtitle="正在加载资料..."
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
          subtitle="当前用户不存在，或你没有查看权限。"
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
        subtitle="更新基础资料、头像和密码。"
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
            <div className={avatarPanelClassName}>
              {targetUid === currentUid ? (
                <Tooltip label="更换头像，仅支持 jpg/png 且大小不超过 200kb。">
                  <button
                    type="button"
                    className="rounded-full border-0 bg-transparent p-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label="上传新头像"
                  >
                    <img
                      className={avatarImageClassName}
                      src={`/api/user/avatar?uid=${targetUid}`}
                      alt={avatarAlt}
                    />
                  </button>
                </Tooltip>
              ) : (
                <img
                  className={avatarImageClassName}
                  src={`/api/user/avatar?uid=${targetUid}`}
                  alt={avatarAlt}
                />
              )}
              <input
                ref={avatarInputRef}
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

            <div className={insetPanelClassName}>
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
            <div className={`${insetPanelClassName} space-y-4`}>
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
              <div className={`${insetPanelClassName} space-y-4`}>
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
