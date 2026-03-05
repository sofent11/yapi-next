import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GroupListItem, ProjectListItem } from '@yapi-next/shared-types';
import {
  CopyOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  UpOutlined,
  UserOutlined,
  FolderAddOutlined
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Row,
  Form,
  Input,
  Layout,
  Modal,
  Popover,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tooltip,
  Typography,
  message,
  Menu
} from 'antd';
import {
  useAddFollowMutation,
  useAddGroupMemberMutation,
  useAddGroupMutation,
  useChangeGroupMemberRoleMutation,
  useCopyProjectMutation,
  useDelFollowMutation,
  useDelGroupMutation,
  useDelGroupMemberMutation,
  useGetGroupListQuery,
  useGetGroupMemberListQuery,
  useGetGroupQuery,
  useGetMyGroupQuery,
  useGetProjectListQuery,
  useLazySearchUsersQuery,
  useGetUserStatusQuery,
  useUpdateGroupMutation
} from '../services/yapi-api';
import { renderProjectIcon, resolveProjectColor } from '../utils/project-visual';
import { LegacyGuideActions } from '../components/LegacyGuideActions';
import { LegacyErrMsg } from '../components/LegacyErrMsg';
import { LegacyTimeline } from '../components/LegacyTimeline';
import { AppShell, PageHeader } from '../components/layout';
import { useLegacyGuide } from '../context/LegacyGuideContext';
import { safeApiRequest } from '../utils/safe-request';
import './Group.scss';

const { Text, Title } = Typography;
const { Content, Sider } = Layout;

type CreateGroupForm = {
  group_name: string;
  group_desc?: string;
  owner_uids?: number[];
  owner_uids_text?: string;
  custom_field1_name?: string;
  custom_field1_enable?: boolean;
};

type GroupMemberRole = 'owner' | 'dev' | 'guest';

type CopyForm = {
  project_name: string;
};

function normalizeGroups(myGroup: GroupListItem | undefined, groups: GroupListItem[]): GroupListItem[] {
  const result: GroupListItem[] = [];
  const used = new Set<number>();

  if (myGroup && Number.isFinite(Number(myGroup._id))) {
    result.push(myGroup);
    used.add(Number(myGroup._id));
  }

  for (const group of groups) {
    const id = Number(group._id);
    if (!Number.isFinite(id) || used.has(id)) continue;
    result.push(group);
    used.add(id);
  }
  return result;
}

type ProjectVisualItem = ProjectListItem & { color?: string; icon?: string };

function canShowGroupSetting(userRole?: string, groupRole?: string, groupType?: string) {
  return (userRole === 'admin' || groupRole === 'owner') && groupType !== 'private';
}

function getProjectVisual(project: ProjectListItem): ProjectVisualItem {
  return project as ProjectVisualItem;
}

export function ProjectConsolePage() {
  const navigate = useNavigate();
  const params = useParams<{ groupId?: string }>();
  const routeGroupId = Number(params.groupId || 0);

  const [createGroupForm] = Form.useForm<CreateGroupForm>();
  const [settingGroupForm] = Form.useForm<CreateGroupForm>();
  const [copyForm] = Form.useForm<CopyForm>();
  const customFieldName = Form.useWatch('custom_field1_name', settingGroupForm);
  const customFieldEnable = Form.useWatch('custom_field1_enable', settingGroupForm);

  const [groupKeyword, setGroupKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<'projects' | 'members' | 'activity' | 'setting'>('projects');
  const [groupId, setGroupId] = useState<number>(Number.isFinite(routeGroupId) ? routeGroupId : 0);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyProjectTarget, setCopyProjectTarget] = useState<ProjectListItem | null>(null);
  const [showDangerOptions, setShowDangerOptions] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberUidInput, setMemberUidInput] = useState('');
  const [memberSelectedUids, setMemberSelectedUids] = useState<number[]>([]);
  const [memberUserOptions, setMemberUserOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [memberRoleInput, setMemberRoleInput] = useState<GroupMemberRole>('dev');
  const customFieldRule = Boolean(customFieldEnable) && !String(customFieldName || '').trim();

  const userStatusQuery = useGetUserStatusQuery();
  const myGroupQuery = useGetMyGroupQuery();
  const groupListQuery = useGetGroupListQuery();
  const groupDetailQuery = useGetGroupQuery({ id: groupId }, { skip: groupId <= 0 });

  const [copyProject, copyProjectState] = useCopyProjectMutation();
  const [addGroup, addGroupState] = useAddGroupMutation();
  const [updateGroup, updateGroupState] = useUpdateGroupMutation();
  const [delGroup, delGroupState] = useDelGroupMutation();
  const [addFollow] = useAddFollowMutation();
  const [delFollow] = useDelFollowMutation();
  const [addGroupMember, addGroupMemberState] = useAddGroupMemberMutation();
  const [delGroupMember, delGroupMemberState] = useDelGroupMemberMutation();
  const [changeGroupMemberRole, changeGroupMemberRoleState] = useChangeGroupMemberRoleMutation();
  const [searchUsers] = useLazySearchUsersQuery();
  const [ownerUserOptions, setOwnerUserOptions] = useState<Array<{ label: string; value: number }>>([]);
  const guide = useLegacyGuide();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const groups = useMemo(() => {
    const rows = (groupListQuery.data?.data || []) as GroupListItem[];
    return normalizeGroups(myGroupQuery.data?.data, rows);
  }, [groupListQuery.data, myGroupQuery.data]);

  useEffect(() => {
    if (!Number.isFinite(routeGroupId) || routeGroupId <= 0) return;
    if (routeGroupId !== groupId) {
      setGroupId(routeGroupId);
      setActiveTab('projects');
    }
  }, [routeGroupId, groupId]);

  useEffect(() => {
    if (groupId <= 0) return;
    window.localStorage.setItem('yapi_last_group_id', String(groupId));
  }, [groupId]);

  useEffect(() => {
    const myGroupId = Number(myGroupQuery.data?.data?._id || 0);
    const existed = groups.some(item => Number(item._id) === routeGroupId);

    if (routeGroupId > 0 && existed) return;

    if (routeGroupId <= 0) {
      if (myGroupQuery.isLoading) return;
      const fallback = myGroupId > 0 ? myGroupId : Number(groups[0]?._id || 0);
      if (fallback > 0) {
        setGroupId(fallback);
        navigate(`/group/${fallback}`, { replace: true });
      }
      return;
    }

    const fallback = myGroupId > 0 ? myGroupId : Number(groups[0]?._id || 0);
    if (fallback > 0) {
      setGroupId(fallback);
      navigate(`/group/${fallback}`, { replace: true });
    }
  }, [groups, myGroupQuery.data?.data?._id, myGroupQuery.isLoading, routeGroupId, navigate]);

  const selectedGroup = useMemo(
    () => groups.find(item => Number(item._id) === groupId) || groupDetailQuery.data?.data,
    [groups, groupId, groupDetailQuery.data]
  );

  const groupType = selectedGroup?.type || 'public';
  const groupRole = selectedGroup?.role || '';
  const userRole = userStatusQuery.data?.data?.role || '';

  useEffect(() => {
    if (!selectedGroup) return;
    setShowDangerOptions(false);
    settingGroupForm.setFieldsValue({
      group_name: selectedGroup.group_name || '',
      group_desc: selectedGroup.group_desc || '',
      custom_field1_name: String(selectedGroup.custom_field1?.name || ''),
      custom_field1_enable: Boolean(selectedGroup.custom_field1?.enable)
    });
  }, [selectedGroup, settingGroupForm]);

  const filteredGroups = useMemo(() => {
    const key = groupKeyword.trim().toLowerCase();
    if (!key) return groups;
    return groups.filter(item => {
      const name = String(item.group_name || '').toLowerCase();
      return name.includes(key);
    });
  }, [groups, groupKeyword]);

  const projectListQuery = useGetProjectListQuery({ groupId }, { skip: groupId <= 0 });
  const groupMemberQuery = useGetGroupMemberListQuery(
    { id: groupId },
    { skip: groupId <= 0 || activeTab !== 'members' }
  );

  const projectRows = (projectListQuery.data?.data?.list || []) as ProjectListItem[];
  const groupMembers = groupMemberQuery.data?.data || [];

  const sortedProjects = useMemo(() => {
    const rows = [...projectRows];
    rows.sort((a, b) => Number(b.up_time || 0) - Number(a.up_time || 0));
    return rows;
  }, [projectRows]);

  const followedProjects = sortedProjects.filter(item => !!item.follow);
  const normalProjects = sortedProjects.filter(item => !item.follow);
  const mixedPublicProjects = [...followedProjects, ...normalProjects];
  const guideVisible = guide.active;
  const personalSpaceTip = (
    <div className="legacy-guide-tip-title">
      <h3><UserOutlined /> 个人空间</h3>
      <p>先从个人空间开始，你可以在这里管理自己的项目与接口。</p>
    </div>
  );

  async function handleCreateGroup(values: CreateGroupForm) {
    const selectedOwnerUids = (values.owner_uids || [])
      .map(item => Number(item))
      .filter(item => Number.isFinite(item) && item > 0);
    const ownerUids = String(values.owner_uids_text || '')
      .split(/[,，]/)
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    const uniqOwnerUids = Array.from(new Set([...selectedOwnerUids, ...ownerUids]));
    const response = await callApi(
      addGroup({
        group_name: values.group_name.trim(),
        group_desc: values.group_desc?.trim() || '',
        owner_uids: uniqOwnerUids.length > 0 ? uniqOwnerUids : undefined
      }).unwrap(),
      '创建分组失败'
    );
    if (!response) return;
    message.success('分组创建成功');
    setCreateGroupOpen(false);
    createGroupForm.resetFields();
    await groupListQuery.refetch();
  }

  async function handleSearchOwnerUsers(keyword: string) {
    const q = keyword.trim();
    if (!q) {
      setOwnerUserOptions([]);
      return;
    }
    const response = await callApi(searchUsers({ q }).unwrap(), '搜索用户失败');
    if (!response) return;
    const options = (response.data || [])
      .map(item => {
        const row = item as unknown as Record<string, unknown>;
        const uid = Number(row.uid || row._id || 0);
        if (!Number.isFinite(uid) || uid <= 0) return null;
        const username = String(row.username || uid);
        const email = String(row.email || '');
        return {
          value: uid,
          label: email ? `${username} (${email})` : username
        };
      })
      .filter(Boolean) as Array<{ label: string; value: number }>;
    setOwnerUserOptions(options);
  }

  async function handleSearchMemberUsers(keyword: string) {
    const q = keyword.trim();
    if (!q) {
      setMemberUserOptions([]);
      return;
    }
    const response = await callApi(searchUsers({ q }).unwrap(), '搜索用户失败');
    if (!response) return;
    const options = (response.data || [])
      .map(item => {
        const row = item as unknown as Record<string, unknown>;
        const uid = Number(row.uid || row._id || 0);
        if (!Number.isFinite(uid) || uid <= 0) return null;
        const username = String(row.username || uid);
        const email = String(row.email || '');
        return {
          value: uid,
          label: email ? `${username} (${email})` : username
        };
      })
      .filter(Boolean) as Array<{ label: string; value: number }>;
    setMemberUserOptions(options);
  }

  function handleDeleteGroup() {
    if (groupId <= 0 || !selectedGroup) return;
    let inputName = '';
    Modal.confirm({
      title: `确认删除 ${selectedGroup.group_name} 分组吗？`,
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      okButtonProps: { loading: delGroupState.isLoading },
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="此操作会删除该分组下所有项目和接口，且无法恢复。"
          />
          <Input
            placeholder="请输入分组名称确认删除"
            onChange={event => {
              inputName = event.target.value;
            }}
          />
        </Space>
      ),
      onOk: async () => {
        if (inputName.trim() !== String(selectedGroup.group_name || '').trim()) {
          message.error('分组名称有误');
          throw new Error('group_name_not_match');
        }
        const response = await callApi(delGroup({ id: groupId }).unwrap(), '删除分组失败');
        if (!response) {
          throw new Error('delete_group_failed');
        }
        message.success('删除分组成功');
        setActiveTab('projects');
        const [groupListResult, myGroupResult] = await Promise.all([
          groupListQuery.refetch(),
          myGroupQuery.refetch()
        ]);
        const list = (groupListResult.data?.data || []) as GroupListItem[];
        const myGroupId = Number(myGroupResult.data?.data?._id || 0);
        const fallback =
          (myGroupId > 0 && list.some(item => Number(item._id) === myGroupId) ? myGroupId : 0) ||
          Number(list[0]?._id || 0);
        if (fallback > 0) {
          setGroupId(fallback);
          navigate(`/group/${fallback}`, { replace: true });
        } else {
          navigate('/group', { replace: true });
        }
      }
    });
  }

  async function handleCopyProject(values: CopyForm) {
    if (!copyProjectTarget || groupId <= 0) {
      message.error('请选择要复制的项目');
      return;
    }

    const sourceId = Number(copyProjectTarget._id || 0);
    const projectName = values.project_name.trim();
    if (!sourceId || !projectName) {
      message.error('复制参数不完整');
      return;
    }

    const response = await callApi(
      copyProject({
        _id: sourceId,
        name: projectName,
        group_id: groupId,
        project_type: copyProjectTarget.project_type || 'private',
        basepath: copyProjectTarget.basepath || '',
        desc: copyProjectTarget.desc || '',
        icon: copyProjectTarget.icon || '',
        color: copyProjectTarget.color || ''
      }).unwrap(),
      '复制项目失败'
    );
    if (!response) return;

    message.success('项目复制成功');
    setCopyModalOpen(false);
    setCopyProjectTarget(null);
    copyForm.resetFields();
    await projectListQuery.refetch();
  }

  async function handleToggleFollow(project: ProjectListItem, event: React.MouseEvent) {
    event.stopPropagation();
    const pid = Number(project._id || 0);
    if (pid <= 0) return;

    if (project.follow) {
      const response = await callApi(delFollow({ projectid: pid }).unwrap(), '取消关注失败');
      if (!response) return;
    } else {
      const response = await callApi(addFollow({ projectid: pid }).unwrap(), '关注失败');
      if (!response) return;
    }

    await projectListQuery.refetch();
  }

  async function handleAddGroupMember() {
    const manualUids = memberUidInput
      .split(/[,，]/)
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    const selectedUids = memberSelectedUids
      .map(item => Number(item))
      .filter(item => Number.isFinite(item) && item > 0);
    const memberUids = Array.from(new Set([...selectedUids, ...manualUids]));
    if (memberUids.length === 0) {
      message.error('请输入合法 UID 或通过搜索选择成员');
      return;
    }

    const response = await callApi(
      addGroupMember({
        id: groupId,
        member_uids: memberUids,
        role: memberRoleInput
      }).unwrap(),
      '添加成员失败'
    );
    if (!response) return;

    const payload = (response.data || {}) as Record<string, unknown>;
    const addMembers = Array.isArray(payload.add_members) ? payload.add_members.length : 0;
    const existMembers = Array.isArray(payload.exist_members) ? payload.exist_members.length : 0;
    setMemberUidInput('');
    setMemberSelectedUids([]);
    setMemberUserOptions([]);
    setAddMemberOpen(false);
    if (addMembers > 0 || existMembers > 0) {
      message.success(`添加成功，已成功添加 ${addMembers} 人，其中 ${existMembers} 人已存在`);
    } else {
      message.success('成员已添加');
    }
    await groupMemberQuery.refetch();
  }

  async function handleSaveGroupSettings(values: CreateGroupForm) {
    const customFieldName = String(values.custom_field1_name || '').trim();
    const customFieldEnable = Boolean(values.custom_field1_enable);
    if (customFieldEnable && !customFieldName) {
      message.error('开启接口自定义字段时，字段名不能为空');
      return;
    }
    const response = await callApi(
      updateGroup({
        id: groupId,
        group_name: values.group_name.trim(),
        group_desc: values.group_desc?.trim() || '',
        custom_field1: {
          name: customFieldName,
          enable: customFieldEnable
        }
      }).unwrap(),
      '保存分组设置失败'
    );
    if (!response) return;

    message.success('分组设置已保存');
    await Promise.all([groupDetailQuery.refetch(), groupListQuery.refetch()]);
  }

  const canCreateProject = /(admin|owner|dev)/.test(groupRole) || userRole === 'admin';
  const canCopyProject = /(admin|owner|dev)/.test(groupRole) || userRole === 'admin';
  const canManageGroupMembers = userRole === 'admin' || groupRole === 'owner';
  const canDeleteGroup = userRole === 'admin' && groupType !== 'private';
  const showMembers = groupType === 'public';
  const showActivity = /(admin|owner|dev|guest)/.test(groupRole) || userRole === 'admin';
  const showSetting = canShowGroupSetting(userRole, groupRole, groupType);

  useEffect(() => {
    if (activeTab === 'projects') return;
    if (activeTab === 'members' && !showMembers) {
      setActiveTab('projects');
      return;
    }
    if (activeTab === 'activity' && !showActivity) {
      setActiveTab('projects');
      return;
    }
    if (activeTab === 'setting' && !showSetting) {
      setActiveTab('projects');
    }
  }, [activeTab, showActivity, showMembers, showSetting]);

  const renderProjectCard = (project: ProjectListItem, isFollowPage?: boolean) => {
    const pid = Number(project._id);
    const visual = getProjectVisual(project);
    const color = resolveProjectColor(visual.color, project.name || String(pid));
    return (
      <div className="card-container" key={pid}>
        <Card
          bordered={false}
          className="m-card"
          onClick={() => navigate(`/project/${pid}`)}
        >
          <div
            className="ui-logo"
            style={{ backgroundColor: color }}
          >
            {renderProjectIcon(visual.icon)}
          </div>
          <h4 className="ui-title">{project.name}</h4>
        </Card>
        <div
          className="card-btns"
          onClick={(e) => handleToggleFollow(project, e)}
        >
          <Tooltip placement="rightTop" title={project.follow ? '取消关注' : '添加关注'}>
            <StarOutlined className={`icon ${project.follow ? 'active' : ''}`} />
          </Tooltip>
        </div>
        {canCopyProject && (
          <div className="copy-btns" onClick={(e) => {
            e.stopPropagation();
            setCopyProjectTarget(project);
            copyForm.setFieldsValue({ project_name: `${project.name || ''}_copy` });
            setCopyModalOpen(true);
          }}>
            <Tooltip placement="rightTop" title="复制项目">
              <CopyOutlined className="icon" />
            </Tooltip>
          </div>
        )}
      </div>
    );
  };

  const renderMainProjectList = () => {
    return (
      <div style={{ paddingTop: '24px' }} className="m-panel card-panel card-panel-s project-list">
        <Row className="project-list-header">
          <Col span={16} style={{ textAlign: 'left' }}>
            {selectedGroup?.group_name || '分组'} 分组共 ({projectRows.length}) 个项目
          </Col>
          <Col span={8}>
            {canCreateProject ? (
              <Button type="primary" onClick={() => navigate('/add-project')}>添加项目</Button>
            ) : (
              <Tooltip title="您没有权限,请联系该分组组长或管理员">
                <Button type="primary" disabled>添加项目</Button>
              </Tooltip>
            )}
          </Col>
        </Row>
        <div style={{ marginTop: 24 }}>
          {projectListQuery.isFetching && projectRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : projectRows.length === 0 ? (
            <LegacyErrMsg type="noProject" />
          ) : groupType === 'private' ? (
            <div>
              {normalProjects.length > 0 && (
                <Row style={{ borderBottom: '1px solid #eee', marginBottom: '15px' }}>
                  <Col span={24}><h3 className="owner-type">我的项目</h3></Col>
                  {normalProjects.map(proj => (
                    <Col xs={8} lg={6} xxl={4} key={proj._id}>{renderProjectCard(proj)}</Col>
                  ))}
                </Row>
              )}
              {followedProjects.length > 0 && (
                <Row>
                  <Col span={24}><h3 className="owner-type">我的关注</h3></Col>
                  {followedProjects.map(proj => (
                    <Col xs={8} lg={6} xxl={4} key={`follow-${proj._id}`}>{renderProjectCard(proj, true)}</Col>
                  ))}
                </Row>
              )}
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              {mixedPublicProjects.map(proj => (
                <Col xs={8} lg={6} xxl={4} key={proj._id}>{renderProjectCard(proj)}</Col>
              ))}
            </Row>
          )}
        </div>
      </div>
    );
  };

  const groupMemberCountTitle = `${selectedGroup?.group_name || '当前'} 分组成员 (${groupMembers.length}) 人`;
  const sortedMembers = [...groupMembers].sort((a, b) => {
    const rank = (r?: string) => { if (r === 'owner') return 0; if (r === 'dev') return 1; if (r === 'guest') return 2; return 99; };
    return rank(a.role) - rank(b.role);
  });

  const tabItems: Array<{ key: 'projects' | 'members' | 'activity' | 'setting'; label: string; children: ReactNode }> = [
    {
      key: 'projects',
      label: '项目列表',
      children: renderMainProjectList()
    }
  ];

  if (showMembers) {
    tabItems.push({
      key: 'members',
      label: '成员列表',
      children: (
        <div className="m-panel">
          <Table
            rowKey={item => Number(item.uid || 0)}
            loading={groupMemberQuery.isLoading || delGroupMemberState.isLoading || changeGroupMemberRoleState.isLoading}
            dataSource={sortedMembers as Array<Record<string, unknown>>}
            pagination={false}
            locale={{
              emptyText: <LegacyErrMsg type="noMemberInGroup" />
            }}
            columns={[
              {
                title: groupMemberCountTitle,
                dataIndex: 'username',
                render: (_, row) => {
                  const uid = Number(row.uid || 0);
                  const username = String(row.username || '-');
                  const email = String(row.email || '');
                  return (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Link to={`/user/profile/${uid}`}>
                        <Avatar src={`/api/user/avatar?uid=${uid}`} style={{ marginRight: 16 }} />
                      </Link>
                      <div>
                        <Link to={`/user/profile/${uid}`}>{username}</Link>
                        {email && <div style={{ fontSize: 12, color: '#999' }}>{email}</div>}
                      </div>
                    </div>
                  );
                }
              },
              {
                title: canManageGroupMembers ? (
                  <Button
                    type="primary"
                    onClick={() => {
                      setMemberUidInput('');
                      setMemberSelectedUids([]);
                      setMemberUserOptions([]);
                      setMemberRoleInput('dev');
                      setAddMemberOpen(true);
                    }}
                  >
                    添加成员
                  </Button>
                ) : '权限',
                width: 220,
                render: (_, row) => {
                  const uid = Number(row.uid || 0);
                  const value = (row.role as GroupMemberRole) || 'dev';
                  if (!canManageGroupMembers) return value === 'owner' ? '组长' : value === 'dev' ? '开发者' : '访客';
                  return (
                    <Space>
                      <Select<GroupMemberRole>
                        value={value}
                        onChange={async (role) => {
                          const response = await callApi(
                            changeGroupMemberRole({ id: groupId, member_uid: uid, role }).unwrap(),
                            '更新成员角色失败'
                          );
                          if (!response) return;
                          message.success('更新成功');
                          await groupMemberQuery.refetch();
                        }}
                        options={[{ value: 'owner', label: '组长' }, { value: 'dev', label: '开发者' }, { value: 'guest', label: '访客' }]}
                        style={{ width: 120 }}
                      />
                      <Popconfirm title="确认删除该成员？" onConfirm={async () => {
                        const response = await callApi(
                          delGroupMember({ id: groupId, member_uid: uid }).unwrap(),
                          '删除成员失败'
                        );
                        if (!response) return;
                        message.success('删除成功');
                        await groupMemberQuery.refetch();
                      }}>
                        <Button danger size="small">删除</Button>
                      </Popconfirm>
                    </Space>
                  );
                }
              }
            ]}
          />
        </div>
      )
    });
  }

  if (showActivity) {
    tabItems.push({
      key: 'activity',
      label: '分组动态',
      children: (
        <div className="m-panel">
          <LegacyTimeline type="group" typeid={groupId} />
        </div>
      )
    });
  }

  if (showSetting) {
    tabItems.push({
      key: 'setting',
      label: '分组设置',
      children: (
        <div className="m-panel group-setting-pane">
          <Form<CreateGroupForm> form={settingGroupForm} layout="vertical" onFinish={handleSaveGroupSettings}>
            <Form.Item label="分组名称" name="group_name" rules={[{ required: true, message: '请输入分组名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="分组简介" name="group_desc">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item label="接口自定义字段">
              <Space align="start">
                <Form.Item noStyle name="custom_field1_name">
                  <Input placeholder="请输入自定义字段名称" status={customFieldRule ? 'error' : ''} style={{ width: 260 }} />
                </Form.Item>
                <Tooltip title="可以在接口中添加额外字段数据">
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, marginTop: 10 }} />
                </Tooltip>
                <Form.Item noStyle name="custom_field1_enable" valuePropName="checked">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              </Space>
              {customFieldRule && <div style={{ color: 'red', marginTop: 8 }}>自定义字段名称不能为空</div>}
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={updateGroupState.isLoading}>保存设置</Button>
          </Form>
          {canDeleteGroup && (
            <div className="group-danger-zone">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}><ExclamationCircleOutlined style={{ color: '#f5222d', marginRight: 8 }} />危险操作</span>
                <Button onClick={() => setShowDangerOptions(v => !v)}>
                  {showDangerOptions ? '收起' : '查看'} {showDangerOptions ? <UpOutlined /> : <DownOutlined />}
                </Button>
              </div>
              {showDangerOptions && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 16 }}>分组删除后将移除分组下所有项目及接口，请谨慎操作。仅管理员可执行该操作。</div>
                  <Button danger onClick={handleDeleteGroup} loading={delGroupState.isLoading}>删除分组</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )
    });
  }

  return (
    <AppShell className="legacy-project-console-page">
      <PageHeader
        title="项目控制台"
        subtitle="统一管理分组、项目、成员与分组设置。"
      />

      <div className="projectGround">
        <Layout className="legacy-project-console-layout">
          <Sider className="legacy-project-console-sider" width={300}>
          <div className="m-group">
            {guideVisible && guide.step === 0 ? <div className="legacy-study-mask" /> : null}
            <div className="group-bar">
              <div className="curr-group">
                <div className="curr-group-name">
                  <span className="name">{selectedGroup?.type === 'private' ? '个人空间' : selectedGroup?.group_name || '项目分组'}</span>
                  <Tooltip title="添加分组">
                    <a className="editSet" onClick={() => {
                      createGroupForm.resetFields();
                      setOwnerUserOptions([]);
                      setCreateGroupOpen(true);
                    }}>
                      <FolderAddOutlined className="btn" />
                    </a>
                  </Tooltip>
                </div>
                <div className="curr-group-desc">简介: {selectedGroup?.group_desc || ''}</div>
              </div>
              <div className="group-operate">
                <div className="search">
                  <Input.Search
                    value={groupKeyword}
                    onChange={event => setGroupKeyword(event.target.value)}
                    placeholder="搜索分类"
                  />
                </div>
              </div>
              {groupListQuery.isLoading && groups.length === 0 && (
                <Spin style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }} />
              )}
              <Menu
                className="group-list"
                mode="inline"
                selectedKeys={[String(groupId)]}
                items={filteredGroups.map(group => {
                  const gid = Number(group._id);
                  const isPrivate = group.type === 'private';
                  const labelNode = isPrivate ? '个人空间' : group.group_name;
                  return {
                    key: String(gid),
                    className: 'group-item',
                    icon: isPrivate ? <UserOutlined /> : <FolderOpenOutlined />,
                    label:
                      isPrivate && gid === groupId && guideVisible && guide.step === 0 ? (
                        <Popover
                          placement="right"
                          open
                          title={personalSpaceTip}
                          content={<LegacyGuideActions onNext={guide.next} onExit={guide.finish} />}
                          overlayClassName="legacy-guide-popover"
                        >
                          <span>{labelNode}</span>
                        </Popover>
                      ) : (
                        labelNode
                      ),
                    onClick: () => {
                      setGroupId(gid);
                      setActiveTab('projects');
                      navigate(`/group/${gid}`, { replace: true });
                    }
                  };
                })}
              />
            </div>
          </div>
          </Sider>

          <Layout>
            <Content className="legacy-project-console-content">
              <Tabs
                type="card"
                className="m-tab tabs-large"
                style={{ height: '100%' }}
                activeKey={activeTab}
                onChange={key => setActiveTab(key as any)}
                items={tabItems}
              />
            </Content>
          </Layout>
        </Layout>
      </div>

      <Modal
        title="添加分组"
        open={createGroupOpen}
        onCancel={() => setCreateGroupOpen(false)}
        onOk={() => createGroupForm.submit()}
        confirmLoading={addGroupState.isLoading}
        okText="创建"
        className="add-group-modal"
      >
        <Form<CreateGroupForm> form={createGroupForm} layout="vertical" onFinish={handleCreateGroup}>
          <Row gutter={6} className="modal-input">
            <Col span={5}><div className="label">分组名：</div></Col>
            <Col span={15}>
              <Form.Item name="group_name" rules={[{ required: true, message: '请输入分组名称' }]} noStyle>
                <Input placeholder="请输入分组名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span={5}><div className="label">简介：</div></Col>
            <Col span={15}>
              <Form.Item name="group_desc" noStyle>
                <Input.TextArea rows={3} placeholder="请输入分组描述" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span={5}><div className="label">组长：</div></Col>
            <Col span={15}>
              <Form.Item name="owner_uids" noStyle>
                <Select<number>
                  mode="multiple"
                  placeholder="输入用户名搜索并选择"
                  options={ownerUserOptions}
                  showSearch
                  filterOption={false}
                  onSearch={value => { void handleSearchOwnerUsers(value); }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={6} className="modal-input">
            <Col span={5}></Col>
            <Col span={15}>
              <Form.Item name="owner_uids_text" noStyle>
                <Input placeholder="多个 UID 用逗号分隔，例如：2,3,4" style={{ marginTop: 8 }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={copyProjectTarget ? `复制项目 ${copyProjectTarget.name}` : '复制项目'}
        open={copyModalOpen}
        onCancel={() => { setCopyModalOpen(false); setCopyProjectTarget(null); }}
        onOk={() => copyForm.submit()}
        okText="确认"
        confirmLoading={copyProjectState.isLoading}
      >
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '25px' }}>
          <Alert
            message={`该操作将会复制 ${copyProjectTarget?.name} 下的所有接口集合，但不包括测试集合中的接口`}
            type="info"
          />
          <div style={{ marginTop: '16px' }}>
            <p><b>项目名称:</b></p>
            <Form<CopyForm> form={copyForm} layout="vertical" onFinish={handleCopyProject}>
              <Form.Item name="project_name" rules={[{ required: true, message: '请输入新项目名称' }]} noStyle>
                <Input placeholder="项目名称" />
              </Form.Item>
            </Form>
          </div>
        </div>
      </Modal>

      <Modal
        title="添加成员"
        open={addMemberOpen}
        onCancel={() => setAddMemberOpen(false)}
        onOk={() => void handleAddGroupMember()}
        okText="添加"
        confirmLoading={addGroupMemberState.isLoading}
      >
        <Form layout="vertical">
          <Form.Item label="按用户名搜索并选择">
            <Select<number[]>
              mode="multiple"
              value={memberSelectedUids}
              options={memberUserOptions}
              placeholder="输入用户名搜索并选择成员"
              showSearch
              filterOption={false}
              onSearch={value => { void handleSearchMemberUsers(value); }}
              onChange={values => setMemberSelectedUids(Array.isArray(values) ? values : [])}
            />
          </Form.Item>
          <Form.Item label="UID 列表">
            <Input value={memberUidInput} onChange={e => setMemberUidInput(e.target.value)} placeholder="多个 UID 用逗号分隔，例如：2,3,4" />
          </Form.Item>
          <Form.Item label="权限">
            <Select<GroupMemberRole> value={memberRoleInput} onChange={setMemberRoleInput} options={[{ value: 'owner', label: '组长' }, { value: 'dev', label: '开发者' }, { value: 'guest', label: '访客' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
