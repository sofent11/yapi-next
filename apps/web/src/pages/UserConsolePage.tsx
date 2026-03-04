import { useMemo, useState } from 'react';
import type { UserProfile } from '@yapi-next/shared-types';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
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

const { Text, Paragraph } = Typography;

function toJsonText(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return '{}';
  }
}

export function UserConsolePage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [targetUid, setTargetUid] = useState<number>(0);
  const [editUsername, setEditUsername] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('admin');
  const [findText, setFindText] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [avatarBasecode, setAvatarBasecode] = useState<string>(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8KXx4AAAAASUVORK5CYII='
  );
  const [avatarUid, setAvatarUid] = useState<number>(0);
  const [avatarVersion, setAvatarVersion] = useState<number>(Date.now());

  const [updateUser, updateUserState] = useUpdateUserMutation();
  const [deleteUser, deleteUserState] = useDeleteUserMutation();
  const [changePassword, changePasswordState] = useChangePasswordMutation();
  const [uploadAvatar, uploadAvatarState] = useUploadAvatarMutation();
  const [findUser, findUserState] = useLazyFindUserQuery();
  const [searchUsers, searchUsersState] = useLazySearchUsersQuery();

  const statusQuery = useGetUserStatusQuery();
  const userListQuery = useGetUserListQuery({ page, limit });

  const currentUid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);

  const userRows = useMemo(() => {
    const list = userListQuery.data?.data?.list || [];
    return list.map(item => ({
      ...item,
      key: Number(item._id || item.uid || 0)
    })) as Array<UserProfile & { key: number }>;
  }, [userListQuery.data]);

  function ensureTargetUid(): number {
    const uid = targetUid > 0 ? targetUid : currentUid;
    if (uid <= 0) {
      message.error('请先指定 UID');
      return 0;
    }
    return uid;
  }

  async function handleFindUser() {
    try {
      const uid = ensureTargetUid();
      if (!uid) return;
      const response = await findUser({ id: uid }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '查询失败');
        return;
      }
      setFindText(toJsonText(response.data));
    } catch (_err) {
      message.error('查询失败，请稍后重试');
    }
  }

  async function handleSearchUsers() {
    try {
      if (!searchKeyword.trim()) {
        message.error('请输入搜索关键词');
        return;
      }
      const response = await searchUsers({ q: searchKeyword.trim() }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '搜索失败');
        return;
      }
      setSearchText(toJsonText(response.data));
    } catch (_err) {
      message.error('搜索失败，请稍后重试');
    }
  }

  async function handleUpdateUser() {
    try {
      const uid = ensureTargetUid();
      if (!uid) return;
      const response = await updateUser({
        uid,
        username: editUsername.trim() || undefined,
        email: editEmail.trim() || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '更新失败');
        return;
      }
      message.success('用户资料已更新');
      await Promise.all([statusQuery.refetch(), userListQuery.refetch()]);
    } catch (_err) {
      message.error('更新失败，请稍后重试');
    }
  }

  async function handleChangePassword() {
    try {
      const uid = ensureTargetUid();
      if (!uid) return;
      if (!newPassword) {
        message.error('新密码不能为空');
        return;
      }
      const response = await changePassword({
        uid,
        old_password: oldPassword || undefined,
        password: newPassword
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '改密失败');
        return;
      }
      message.success('密码已更新');
      setOldPassword('');
      setNewPassword('');
    } catch (_err) {
      message.error('改密失败，请稍后重试');
    }
  }

  async function handleDeleteUser() {
    try {
      const uid = ensureTargetUid();
      if (!uid) return;
      const response = await deleteUser({ id: uid }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '删除失败');
        return;
      }
      message.success('删除用户请求已执行');
      await userListQuery.refetch();
    } catch (_err) {
      message.error('删除失败，请稍后重试');
    }
  }

  async function handleUploadAvatar() {
    try {
      const response = await uploadAvatar({
        basecode: avatarBasecode.trim()
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '头像上传失败');
        return;
      }
      setAvatarVersion(Date.now());
      message.success('头像已上传');
    } catch (_err) {
      message.error('头像上传失败，请稍后重试');
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Paragraph style={{ marginBottom: 8 }}>
          User Console：用户域业务页面（用户列表、搜索、资料更新、改密、删除、头像）。
        </Paragraph>
        <Tag color="green">当前用户：{statusQuery.data?.data?.username || statusQuery.data?.data?.email || '-'}</Tag>
      </Card>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="用户列表与查询">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space>
                <Text>页码</Text>
                <InputNumber min={1} value={page} onChange={value => setPage(Number(value || 1))} />
                <Text>每页</Text>
                <InputNumber min={1} max={100} value={limit} onChange={value => setLimit(Number(value || 20))} />
                <Button onClick={() => userListQuery.refetch()}>
                  刷新列表
                </Button>
              </Space>

              <Table
                size="small"
                rowKey="key"
                loading={userListQuery.isLoading}
                dataSource={userRows}
                pagination={false}
                columns={[
                  {
                    title: 'UID',
                    dataIndex: '_id',
                    width: 90,
                    render: (_value, row) => Number(row._id || row.uid || 0)
                  },
                  { title: '用户名', dataIndex: 'username' },
                  { title: '邮箱', dataIndex: 'email' },
                  { title: '角色', dataIndex: 'role', width: 110 }
                ]}
              />

              <Space>
                <InputNumber
                  min={1}
                  value={targetUid || undefined}
                  onChange={value => setTargetUid(Number(value || 0))}
                  placeholder="目标 UID"
                />
                <Button onClick={handleFindUser} loading={findUserState.isFetching}>
                  查询用户
                </Button>
                <Input
                  style={{ width: 220 }}
                  value={searchKeyword}
                  onChange={event => setSearchKeyword(event.target.value)}
                  placeholder="搜索关键词"
                />
                <Button onClick={handleSearchUsers} loading={searchUsersState.isFetching}>
                  搜索用户
                </Button>
              </Space>

              <Row gutter={12}>
                <Col span={12}>
                  <Input.TextArea rows={8} value={findText} readOnly placeholder="find result" />
                </Col>
                <Col span={12}>
                  <Input.TextArea rows={8} value={searchText} readOnly placeholder="search result" />
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>

        <Col span={10}>
          <Card title="用户操作">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Descriptions size="small" bordered column={1}>
                <Descriptions.Item label="当前 UID">{currentUid || '-'}</Descriptions.Item>
                <Descriptions.Item label="用户名">{statusQuery.data?.data?.username || '-'}</Descriptions.Item>
                <Descriptions.Item label="角色">{statusQuery.data?.data?.role || '-'}</Descriptions.Item>
              </Descriptions>

              <Text strong>资料更新</Text>
              <Input value={editUsername} onChange={event => setEditUsername(event.target.value)} placeholder="新用户名（可选）" />
              <Input value={editEmail} onChange={event => setEditEmail(event.target.value)} placeholder="新邮箱（可选）" />
              <Button type="primary" onClick={handleUpdateUser} loading={updateUserState.isLoading}>
                更新资料
              </Button>

              <Text strong>修改密码</Text>
              <Input.Password value={oldPassword} onChange={event => setOldPassword(event.target.value)} placeholder="旧密码（可选）" />
              <Input.Password value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="新密码" />
              <Button onClick={handleChangePassword} loading={changePasswordState.isLoading}>
                修改密码
              </Button>

              <Button danger onClick={handleDeleteUser} loading={deleteUserState.isLoading}>
                删除目标用户
              </Button>

              <Text strong>头像上传</Text>
              <Space>
                <InputNumber
                  min={1}
                  value={avatarUid || undefined}
                  onChange={value => setAvatarUid(Number(value || 0))}
                  placeholder="avatar uid"
                />
                <Button onClick={() => setAvatarVersion(Date.now())}>刷新头像</Button>
              </Space>
              <Input.TextArea rows={4} value={avatarBasecode} onChange={event => setAvatarBasecode(event.target.value)} placeholder="data:image/png;base64,..." />
              <Button onClick={handleUploadAvatar} loading={uploadAvatarState.isLoading}>
                上传头像
              </Button>
              <img
                alt="avatar-preview"
                src={`/api/user/avatar?uid=${avatarUid || currentUid || ''}&_ts=${avatarVersion}`}
                style={{ width: 72, height: 72, borderRadius: 8, border: '1px solid #d9d9d9' }}
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
