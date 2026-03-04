import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@yapi-next/shared-types';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Typography,
  message
} from 'antd';
import {
  useChangePasswordMutation,
  useDeleteUserMutation,
  useGetUserListQuery,
  useGetUserStatusQuery,
  useLazyFindUserQuery,
  useLazyGetUserProjectContextQuery,
  useLazySearchUsersQuery,
  useLazyUpdateStudyQuery,
  useLoginByTokenMutation,
  useLoginMutation,
  useLogoutMutation,
  useRegisterUserMutation,
  useUpdateUserMutation,
  useUploadAvatarMutation
} from '../services/yapi-api';

const { Paragraph } = Typography;

function toJsonText(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return '{}';
  }
}

export function UserWorkbenchPage() {
  const [email, setEmail] = useState<string>('smoke-user@example.com');
  const [password, setPassword] = useState<string>('Pass@123');
  const [username, setUsername] = useState<string>('smoke-user');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [targetUid, setTargetUid] = useState<number>(0);
  const [updateUsername, setUpdateUsername] = useState<string>('');
  const [updateEmail, setUpdateEmail] = useState<string>('');
  const [oldPassword, setOldPassword] = useState<string>('Pass@123');
  const [newPassword, setNewPassword] = useState<string>('Pass@456');
  const [deleteUid, setDeleteUid] = useState<number>(0);
  const [searchKeyword, setSearchKeyword] = useState<string>('smoke');
  const [searchResultText, setSearchResultText] = useState<string>('');
  const [findResultText, setFindResultText] = useState<string>('');
  const [projectContextType, setProjectContextType] = useState<'interface' | 'project' | 'group'>(
    'project'
  );
  const [projectContextId, setProjectContextId] = useState<number>(0);
  const [projectContextText, setProjectContextText] = useState<string>('');
  const [avatarUid, setAvatarUid] = useState<number>(0);
  const [avatarVersion, setAvatarVersion] = useState<number>(Date.now());
  const [avatarBasecode, setAvatarBasecode] = useState<string>(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8KXx4AAAAASUVORK5CYII='
  );
  const [tokenEmail, setTokenEmail] = useState<string>('third-user@example.com');
  const [tokenUsername, setTokenUsername] = useState<string>('third-user');

  const [login, loginState] = useLoginMutation();
  const [registerUser, registerState] = useRegisterUserMutation();
  const [logout, logoutState] = useLogoutMutation();
  const [updateUser, updateUserState] = useUpdateUserMutation();
  const [deleteUser, deleteUserState] = useDeleteUserMutation();
  const [changePassword, changePasswordState] = useChangePasswordMutation();
  const [uploadAvatar, uploadAvatarState] = useUploadAvatarMutation();
  const [loginByToken, loginByTokenState] = useLoginByTokenMutation();
  const [triggerFindUser, findUserQuery] = useLazyFindUserQuery();
  const [triggerSearchUsers, searchUsersQuery] = useLazySearchUsersQuery();
  const [triggerProjectContext, projectContextQuery] = useLazyGetUserProjectContextQuery();
  const [triggerUpdateStudy, updateStudyQuery] = useLazyUpdateStudyQuery();

  const statusQuery = useGetUserStatusQuery();
  const userListQuery = useGetUserListQuery(
    { page, limit },
    {
      skip: statusQuery.data?.errcode !== 0
    }
  );

  const isLoggedIn = statusQuery.data?.errcode === 0 && !!statusQuery.data?.data;

  useEffect(() => {
    const uid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);
    if (!Number.isFinite(uid) || uid <= 0) return;
    setTargetUid(prev => (prev > 0 ? prev : uid));
    setAvatarUid(prev => (prev > 0 ? prev : uid));
    setDeleteUid(prev => (prev > 0 ? prev : uid));
  }, [statusQuery.data]);

  const userRows = useMemo(() => {
    const list = userListQuery.data?.data?.list || [];
    return list.map(item => ({
      key: item._id || item.uid || 0,
      ...item
    })) as Array<UserProfile & { key: number }>;
  }, [userListQuery.data]);

  async function handleLogin() {
    const response = await login({ email, password }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '登录失败');
      return;
    }
    message.success('登录成功');
    await statusQuery.refetch();
  }

  async function handleRegister() {
    const response = await registerUser({ email, password, username }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '注册失败');
      return;
    }
    message.success('注册成功');
    await statusQuery.refetch();
  }

  async function handleLogout() {
    const response = await logout().unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '退出失败');
      return;
    }
    message.success('已退出');
    await statusQuery.refetch();
  }

  async function handleFindUser() {
    if (targetUid <= 0) {
      message.error('请输入有效 UID');
      return;
    }
    const response = await triggerFindUser({ id: targetUid }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '查询用户失败');
      return;
    }
    setFindResultText(toJsonText(response.data));
  }

  async function handleSearchUsers() {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      message.error('请输入关键词');
      return;
    }
    const response = await triggerSearchUsers({ q: keyword }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '用户搜索失败');
      return;
    }
    setSearchResultText(toJsonText(response.data));
  }

  async function handleUpdateUser() {
    if (targetUid <= 0) {
      message.error('请输入有效 UID');
      return;
    }
    const response = await updateUser({
      uid: targetUid,
      username: updateUsername.trim() || undefined,
      email: updateEmail.trim() || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '更新用户失败');
      return;
    }
    message.success('用户信息已更新');
    await Promise.all([statusQuery.refetch(), userListQuery.refetch()]);
  }

  async function handleChangePassword() {
    if (targetUid <= 0) {
      message.error('请输入有效 UID');
      return;
    }
    const response = await changePassword({
      uid: targetUid,
      old_password: oldPassword,
      password: newPassword
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改密码失败');
      return;
    }
    message.success('密码已更新');
  }

  async function handleDeleteUser() {
    if (deleteUid <= 0) {
      message.error('请输入有效 UID');
      return;
    }
    const response = await deleteUser({ id: deleteUid }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '删除用户失败');
      return;
    }
    message.success('用户删除请求已执行');
    await userListQuery.refetch();
  }

  async function handleUpdateStudy() {
    const response = await triggerUpdateStudy().unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || 'up_study 调用失败');
      return;
    }
    message.success('study 已更新');
    await statusQuery.refetch();
  }

  async function handleProjectContext() {
    if (projectContextId <= 0) {
      message.error('请输入有效 ID');
      return;
    }
    const response = await triggerProjectContext({
      type: projectContextType,
      id: projectContextId
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || 'project 上下文查询失败');
      return;
    }
    setProjectContextText(toJsonText(response.data));
  }

  async function handleUploadAvatar() {
    const response = await uploadAvatar({ basecode: avatarBasecode.trim() }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '头像上传失败');
      return;
    }
    setAvatarVersion(Date.now());
    message.success('头像已上传');
  }

  async function handleLoginByToken() {
    const response = await loginByToken({
      email: tokenEmail.trim(),
      username: tokenUsername.trim() || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || 'token 登录失败');
      return;
    }
    message.success('token 登录成功');
    await statusQuery.refetch();
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="用户兼容接口工作台">
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          覆盖 user 迁移后的核心接口：登录/注册、列表/查找/搜索、资料更新、改密、头像、第三方登录与上下文查询。
        </Paragraph>
      </Card>

      <Card title="登录与注册">
        <Row gutter={12}>
          <Col span={12}>
            <Form layout="vertical" onFinish={handleLogin}>
              <Form.Item label="邮箱">
                <Input value={email} onChange={event => setEmail(event.target.value)} />
              </Form.Item>
              <Form.Item label="密码">
                <Input.Password value={password} onChange={event => setPassword(event.target.value)} />
              </Form.Item>
              <Form.Item label="用户名（注册可选）">
                <Input value={username} onChange={event => setUsername(event.target.value)} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loginState.isLoading}>
                  登录
                </Button>
                <Button onClick={handleRegister} loading={registerState.isLoading}>
                  注册
                </Button>
                <Button onClick={handleLogout} loading={logoutState.isLoading}>
                  退出
                </Button>
              </Space>
            </Form>
          </Col>
          <Col span={12}>
            {isLoggedIn ? (
              <Descriptions bordered size="small" column={1} title="当前会话">
                <Descriptions.Item label="UID">
                  {statusQuery.data?.data?._id || statusQuery.data?.data?.uid}
                </Descriptions.Item>
                <Descriptions.Item label="用户名">{statusQuery.data?.data?.username}</Descriptions.Item>
                <Descriptions.Item label="角色">{statusQuery.data?.data?.role}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{statusQuery.data?.data?.email}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Alert type="warning" showIcon message={statusQuery.data?.errmsg || '未登录'} />
            )}
          </Col>
        </Row>
      </Card>

      <Card title="用户列表 / 查找 / 搜索">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Button onClick={() => userListQuery.refetch()} disabled={!isLoggedIn}>
              刷新列表
            </Button>
            <span>页码</span>
            <InputNumber min={1} value={page} onChange={value => setPage(Number(value || 1))} />
            <span>每页</span>
            <InputNumber min={1} max={100} value={limit} onChange={value => setLimit(Number(value || 20))} />
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
                width: 100,
                render: (_value, row) => row._id || row.uid || '-'
              },
              { title: '用户名', dataIndex: 'username' },
              { title: '邮箱', dataIndex: 'email' },
              { title: '角色', dataIndex: 'role', width: 120 },
              { title: '类型', dataIndex: 'type', width: 120 }
            ]}
          />

          <Row gutter={12}>
            <Col span={8}>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                value={targetUid}
                onChange={value => setTargetUid(Number(value || 0))}
                placeholder="输入 UID"
              />
            </Col>
            <Col span={16}>
              <Space>
                <Button onClick={handleFindUser} loading={findUserQuery.isFetching}>
                  find
                </Button>
                <Input
                  style={{ minWidth: 220 }}
                  value={searchKeyword}
                  onChange={event => setSearchKeyword(event.target.value)}
                  placeholder="search keyword"
                />
                <Button onClick={handleSearchUsers} loading={searchUsersQuery.isFetching}>
                  search
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Input.TextArea rows={8} value={findResultText} readOnly placeholder="find result" />
            </Col>
            <Col span={12}>
              <Input.TextArea rows={8} value={searchResultText} readOnly placeholder="search result" />
            </Col>
          </Row>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="用户修改 / 改密 / 删除">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                value={targetUid}
                onChange={value => setTargetUid(Number(value || 0))}
                placeholder="目标 UID"
              />
              <Input
                value={updateUsername}
                onChange={event => setUpdateUsername(event.target.value)}
                placeholder="新用户名（可选）"
              />
              <Input
                value={updateEmail}
                onChange={event => setUpdateEmail(event.target.value)}
                placeholder="新邮箱（可选）"
              />
              <Button type="primary" onClick={handleUpdateUser} loading={updateUserState.isLoading}>
                更新用户资料
              </Button>

              <Input.Password
                value={oldPassword}
                onChange={event => setOldPassword(event.target.value)}
                placeholder="旧密码（管理员给非管理员改密可留空）"
              />
              <Input.Password
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                placeholder="新密码"
              />
              <Button onClick={handleChangePassword} loading={changePasswordState.isLoading}>
                修改密码
              </Button>
              <Button onClick={handleUpdateStudy} loading={updateStudyQuery.isFetching}>
                up_study
              </Button>

              <Space>
                <InputNumber
                  min={1}
                  value={deleteUid}
                  onChange={value => setDeleteUid(Number(value || 0))}
                  placeholder="删除 UID"
                />
                <Button danger onClick={handleDeleteUser} loading={deleteUserState.isLoading}>
                  删除用户
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="头像 / 上下文 / 三方登录">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space>
                <InputNumber
                  min={1}
                  value={avatarUid}
                  onChange={value => setAvatarUid(Number(value || 0))}
                  placeholder="头像 UID"
                />
                <Button onClick={() => setAvatarVersion(Date.now())}>刷新头像</Button>
              </Space>
              <Input.TextArea
                rows={4}
                value={avatarBasecode}
                onChange={event => setAvatarBasecode(event.target.value)}
                placeholder="data:image/png;base64,..."
              />
              <Button onClick={handleUploadAvatar} loading={uploadAvatarState.isLoading}>
                上传头像
              </Button>
              <img
                alt="avatar-preview"
                src={`/api/user/avatar?uid=${avatarUid || ''}&_ts=${avatarVersion}`}
                style={{ width: 72, height: 72, borderRadius: 8, border: '1px solid #d9d9d9' }}
              />

              <Row gutter={8}>
                <Col span={12}>
                  <Input value={tokenEmail} onChange={event => setTokenEmail(event.target.value)} placeholder="token email" />
                </Col>
                <Col span={12}>
                  <Input
                    value={tokenUsername}
                    onChange={event => setTokenUsername(event.target.value)}
                    placeholder="token username"
                  />
                </Col>
              </Row>
              <Button onClick={handleLoginByToken} loading={loginByTokenState.isLoading}>
                login_by_token
              </Button>

              <Row gutter={8}>
                <Col span={8}>
                  <Select<'interface' | 'project' | 'group'>
                    value={projectContextType}
                    style={{ width: '100%' }}
                    onChange={setProjectContextType}
                    options={[
                      { value: 'interface', label: 'interface' },
                      { value: 'project', label: 'project' },
                      { value: 'group', label: 'group' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    value={projectContextId}
                    onChange={value => setProjectContextId(Number(value || 0))}
                    placeholder="ID"
                  />
                </Col>
                <Col span={8}>
                  <Button
                    style={{ width: '100%' }}
                    onClick={handleProjectContext}
                    loading={projectContextQuery.isFetching}
                  >
                    查询上下文
                  </Button>
                </Col>
              </Row>
              <Input.TextArea rows={8} readOnly value={projectContextText} placeholder="project context result" />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
