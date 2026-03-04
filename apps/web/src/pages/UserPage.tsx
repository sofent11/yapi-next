import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Row,
  Col,
  Tooltip
} from 'antd';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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

import './User.scss';

const { Text } = Typography;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
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
  const [limit, setLimit] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [searchRows, setSearchRows] = useState<Array<Record<string, unknown>>>([]);
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
  const [uploadAvatar, uploadAvatarState] = useUploadAvatarMutation();

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
    return (findUserState.data?.data || null) as
      | { uid?: number; _id?: number; username?: string; email?: string; role?: 'admin' | 'member'; type?: string; add_time?: number; up_time?: number }
      | null;
  }, [findUserState.data]);

  useEffect(() => {
    if (!profileData) return;
    setUsernameInput(profileData.username || '');
    setEmailInput(profileData.email || '');
    setRoleInput((profileData.role as 'admin' | 'member') || 'member');
  }, [profileData]);

  const tableRows: Array<Record<string, unknown>> = useMemo(() => {
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
    })) as Array<Record<string, unknown>>;
  }, [isSearching, searchRows, userListQuery.data]);

  const canEditBasic = isAdmin || currentUid === targetUid;
  const canEditRole = isAdmin;
  const canChangePassword = canEditBasic && (profileData?.type || 'site') === 'site';

  async function handleSearch() {
    const q = keyword.trim();
    if (!q) {
      setIsSearching(false);
      setSearchRows([]);
      return;
    }
    const response = await searchUsers({ q }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '搜索失败');
      return;
    }
    setSearchRows((response.data || []) as unknown as Array<Record<string, unknown>>);
    setIsSearching(true);
  }

  async function handleDelete(uid: number) {
    const response = await deleteUser({ id: uid }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '删除失败');
      return;
    }
    message.success('已删除此用户');
    await userListQuery.refetch();
  }

  async function handleSaveProfile() {
    if (targetUid <= 0) {
      message.error('无效用户');
      return;
    }
    const response = await updateUser({
      uid: targetUid,
      username: usernameInput.trim() || undefined,
      email: emailInput.trim() || undefined,
      role: canEditRole ? roleInput : undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '更新失败');
      return;
    }
    message.success('更新成功');
    await Promise.all([findUser({ id: targetUid }), userListQuery.refetch(), statusQuery.refetch()]);
  }

  async function handleChangePassword() {
    if (targetUid <= 0) {
      message.error('无效用户');
      return;
    }
    if (!newPassword) {
      message.error('请输入新密码');
      return;
    }
    if (newPassword !== confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    const response = await changePassword({
      uid: targetUid,
      old_password: oldPassword || undefined,
      password: newPassword
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改密码失败');
      return;
    }
    message.success('密码修改成功');
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleAvatarUpload(file?: File | null) {
    if (!file || targetUid !== currentUid) return;

    const isJpg = file.type === 'image/jpeg';
    const isPng = file.type === 'image/png';
    if (!isJpg && !isPng) {
      message.error('图片格式仅支持 jpg/png');
      return;
    }
    if (file.size / 1024 / 1024 >= 0.2) {
      message.error('图片必须小于 200kb');
      return;
    }

    const basecode = await fileToBase64(file);
    const response = await uploadAvatar({ basecode }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '上传头像失败');
      return;
    }
    message.success('头像已更新');
    await statusQuery.refetch();
  }

  if (!inProfile) {
    return (
      <div>
        <div className="g-doc">
          <Row className="user-box">
            <section className="user-table">
              <div className="user-search-wrapper">
                <h2 style={{ marginBottom: '10px' }}>用户总数：{userListQuery.data?.data?.count || 0}位</h2>
                <Input.Search
                  className="legacy-search-input"
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  onSearch={() => void handleSearch()}
                  placeholder="请输入用户名"
                />
              </div>

              {!isAdmin ? (
                <Alert
                  type="warning"
                  showIcon
                  message="仅管理员可查看完整用户列表"
                  description={<Link to={`/user/profile/${currentUid}`}>进入个人中心</Link>}
                  style={{ marginBottom: 16 }}
                />
              ) : null}

              <Table
                bordered={true}
                rowKey="key"
                loading={userListQuery.isLoading || deleteUserState.isLoading}
                dataSource={tableRows}
                pagination={
                  isSearching
                    ? { total: tableRows.length, pageSize: limit, current: 1 }
                    : {
                      total: userListQuery.data?.data?.count || 0,
                      pageSize: limit,
                      current: page,
                      onChange: (next, nextSize) => {
                        setPage(next);
                        if (nextSize && nextSize !== limit) {
                          setLimit(nextSize);
                        }
                      }
                    }
                }
                columns={[
                  {
                    title: '用户名',
                    dataIndex: 'username',
                    width: 180,
                    render: (value, row) => <Link to={`/user/profile/${Number(row._id || row.uid || 0)}`}>{String(value)}</Link>
                  },
                  { title: 'Email', dataIndex: 'email' },
                  {
                    title: '用户角色',
                    dataIndex: 'role',
                    width: 150
                  },
                  {
                    title: '更新日期',
                    dataIndex: 'up_time',
                    width: 160,
                    render: value => (value ? new Date(Number(value) * 1000).toLocaleString() : '-')
                  },
                  ...(isAdmin
                    ? [
                      {
                        title: '功能',
                        width: '90px',
                        render: (_: unknown, row: Record<string, unknown>) => (
                          <Popconfirm
                            title="确认删除此用户?"
                            okText="确定"
                            cancelText="取消"
                            onConfirm={() => void handleDelete(Number(row._id || row.uid || 0))}
                          >
                            <a style={{ display: 'block', textAlign: 'center' }}>删除</a>
                          </Popconfirm>
                        )
                      }
                    ]
                    : [])
                ]}
              />
            </section>
          </Row>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="g-doc">
        <Row className="user-box">
          <div className="user-profile">
            <div className="user-item-body">
              {targetUid === currentUid ? (
                <h3>个人设置</h3>
              ) : (
                <h3>{(profileData?.username || targetUid)} 资料设置</h3>
              )}

              <Button className="bacToPer" onClick={() => navigate('/user/list')}>返回用户列表</Button>

              <Row className="avatarCon" justify="start">
                <Col span={24}>
                  {targetUid === currentUid ? (
                    <div className="avatar-box">
                      <Tooltip placement="right" title={<div>点击头像更换 (只支持jpg、png格式且大小不超过200kb的图片)</div>}>
                        <div style={{ width: 100, height: 100, position: 'relative' }}>
                          <label htmlFor="avatar-upload-input" className="avatar-uploader" style={{ display: 'block', cursor: 'pointer', height: 100 }}>
                            <img className="avatar" src={`/api/user/avatar?uid=${targetUid}`} alt="avatar" />
                          </label>
                          <input
                            id="avatar-upload-input"
                            type="file"
                            accept="image/png,image/jpeg"
                            style={{ display: 'none' }}
                            onChange={event => {
                              const file = event.target.files?.[0];
                              void handleAvatarUpload(file);
                              event.currentTarget.value = '';
                            }}
                          />
                        </div>
                      </Tooltip>
                      <span className="avatarChange"></span>
                    </div>
                  ) : (
                    <div className="avatarImg">
                      <img src={`/api/user/avatar?uid=${targetUid}`} alt="avatar" />
                    </div>
                  )}
                </Col>
              </Row>

              <Row className="user-item" justify="start">
                <div className="maoboli" />
                <Col span={4}>用户id</Col>
                <Col span={12}>{targetUid}</Col>
              </Row>

              <Row className="user-item" justify="start">
                <div className="maoboli" />
                <Col span={4}>用户名</Col>
                <Col span={12}>
                  <Space>
                    <Input value={usernameInput} onChange={e => setUsernameInput(e.target.value)} disabled={!canEditBasic} placeholder="用户名" />
                    {canEditBasic ? (
                      <Button type="primary" onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                        更新
                      </Button>
                    ) : null}
                  </Space>
                </Col>
              </Row>

              <Row className="user-item" justify="start">
                <div className="maoboli" />
                <Col span={4}>Email</Col>
                <Col span={12}>
                  <Space>
                    <Input value={emailInput} onChange={e => setEmailInput(e.target.value)} disabled={!canEditBasic} placeholder="Email" />
                    {canEditBasic ? (
                      <Button type="primary" onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                        更新
                      </Button>
                    ) : null}
                  </Space>
                </Col>
              </Row>

              <Row className="user-item" justify="start" style={{ display: isAdmin ? '' : 'none' }}>
                <div className="maoboli" />
                <Col span={4}>角色</Col>
                <Col span={12}>
                  <Space>
                    <Select<'admin' | 'member'>
                      value={roleInput}
                      onChange={setRoleInput}
                      disabled={!canEditRole}
                      options={[
                        { value: 'admin', label: '管理员' },
                        { value: 'member', label: '会员' }
                      ]}
                      style={{ width: 150 }}
                    />
                    {canEditRole ? (
                      <Button type="primary" onClick={() => void handleSaveProfile()} loading={updateUserState.isLoading}>
                        更新
                      </Button>
                    ) : null}
                  </Space>
                </Col>
              </Row>

              <Row className="user-item" justify="start" style={{ display: isAdmin ? '' : 'none' }}>
                <div className="maoboli" />
                <Col span={4}>登陆方式</Col>
                <Col span={12}>{profileData?.type === 'site' ? '站点登陆' : '第三方登陆'}</Col>
              </Row>

              <Row className="user-item" justify="start">
                <div className="maoboli" />
                <Col span={4}>创建账号时间</Col>
                <Col span={12}>{profileData?.add_time ? new Date(Number(profileData.add_time) * 1000).toLocaleString() : '-'}</Col>
              </Row>

              <Row className="user-item" justify="start">
                <div className="maoboli" />
                <Col span={4}>更新账号时间</Col>
                <Col span={12}>{profileData?.up_time ? new Date(Number(profileData.up_time) * 1000).toLocaleString() : '-'}</Col>
              </Row>

              {(profileData?.type || 'site') === 'site' ? (
                <Row className="user-item" justify="start">
                  <div className="maoboli" />
                  <Col span={4}>密码</Col>
                  <Col span={12}>
                    <div>
                      {isAdmin && profileData?.role !== 'admin' ? null : (
                        <Input.Password
                          id="old_password"
                          value={oldPassword}
                          onChange={event => setOldPassword(event.target.value)}
                          placeholder="旧的密码"
                        />
                      )}
                      <Input.Password
                        id="password"
                        value={newPassword}
                        onChange={event => setNewPassword(event.target.value)}
                        placeholder="新的密码"
                      />
                      <Input.Password
                        id="verify_pass"
                        value={confirmPassword}
                        onChange={event => setConfirmPassword(event.target.value)}
                        placeholder="确认密码"
                      />
                      <Button style={{ marginTop: 20 }} type="primary" onClick={() => void handleChangePassword()} loading={changePasswordState.isLoading}>
                        确定修改
                      </Button>
                    </div>
                  </Col>
                </Row>
              ) : null}

            </div>
          </div>
        </Row>
      </div>
    </div>
  );
}
