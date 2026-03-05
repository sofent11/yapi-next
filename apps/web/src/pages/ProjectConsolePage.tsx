import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GroupListItem, ProjectListItem, UserSearchItem } from '@yapi-next/shared-types';
import { UserOutlined } from '@ant-design/icons';
import {
  Button,
  Alert,
  Form,
  Layout,
  Modal,
  Space,
  Tabs,
  message
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
import { ProjectConsoleActivityTab } from './components/ProjectConsoleActivityTab';
import { ProjectConsoleMembersTab } from './components/ProjectConsoleMembersTab';
import { ProjectConsoleModals } from './components/ProjectConsoleModals';
import { ProjectConsoleProjectTab } from './components/ProjectConsoleProjectTab';
import { ProjectConsoleSettingTab } from './components/ProjectConsoleSettingTab';
import type { GroupSettingForm } from './components/ProjectConsoleSettingTab';
import { ProjectConsoleSidebar } from './components/ProjectConsoleSidebar';
import { AppShell, PageHeader } from '../components/layout';
import { useLegacyGuide } from '../context/LegacyGuideContext';
import { safeApiRequest } from '../utils/safe-request';
import './Group.scss';

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

type ConsoleTabKey = 'projects' | 'members' | 'activity' | 'setting';

function isConsoleTabKey(key: string): key is ConsoleTabKey {
  return key === 'projects' || key === 'members' || key === 'activity' || key === 'setting';
}

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

function canShowGroupSetting(userRole?: string, groupRole?: string, groupType?: string) {
  return (userRole === 'admin' || groupRole === 'owner') && groupType !== 'private';
}

export function ProjectConsolePage() {
  const navigate = useNavigate();
  const params = useParams<{ groupId?: string }>();
  const routeGroupId = Number(params.groupId || 0);

  const [createGroupForm] = Form.useForm<CreateGroupForm>();
  const [settingGroupForm] = Form.useForm<GroupSettingForm>();
  const [copyForm] = Form.useForm<CopyForm>();
  const customFieldName = Form.useWatch('custom_field1_name', settingGroupForm);
  const customFieldEnable = Form.useWatch('custom_field1_enable', settingGroupForm);

  const [groupKeyword, setGroupKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<ConsoleTabKey>('projects');
  const [groupId, setGroupId] = useState<number>(Number.isFinite(routeGroupId) ? routeGroupId : 0);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyProjectTarget, setCopyProjectTarget] = useState<ProjectListItem | null>(null);
  const [showDangerOptions, setShowDangerOptions] = useState(false);
  const [dangerConfirmName, setDangerConfirmName] = useState('');
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
    setDangerConfirmName('');
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
    const options = (response.data || []).flatMap(item => {
      const row = item as UserSearchItem;
      const uid = Number(row.uid || 0);
      if (!Number.isFinite(uid) || uid <= 0) return [];
      const username = String(row.username || uid);
      const email = String(row.email || '');
      return [
        {
          value: uid,
          label: email ? `${username} (${email})` : username
        }
      ];
    });
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
    const options = (response.data || []).flatMap(item => {
      const row = item as UserSearchItem;
      const uid = Number(row.uid || 0);
      if (!Number.isFinite(uid) || uid <= 0) return [];
      const username = String(row.username || uid);
      const email = String(row.email || '');
      return [
        {
          value: uid,
          label: email ? `${username} (${email})` : username
        }
      ];
    });
    setMemberUserOptions(options);
  }

  function handleDeleteGroup() {
    if (groupId <= 0 || !selectedGroup) return;
    const expectedGroupName = String(selectedGroup.group_name || '').trim();
    const inputName = dangerConfirmName.trim();
    if (!inputName) {
      message.error('请输入分组名称以确认删除');
      return;
    }
    if (inputName !== expectedGroupName) {
      message.error('分组名称有误');
      return;
    }
    Modal.confirm({
      title: `确认删除 ${selectedGroup.group_name} 分组吗？`,
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      okButtonProps: { loading: delGroupState.isLoading },
      content: (
        <Space direction="vertical" className="legacy-console-danger-confirm-content">
          <Alert
            type="warning"
            showIcon
            message="此操作会删除该分组下所有项目和接口，且无法恢复。"
          />
          <div>已确认分组名: <b>{inputName}</b></div>
        </Space>
      ),
      onOk: async () => {
        const response = await callApi(delGroup({ id: groupId }).unwrap(), '删除分组失败');
        if (!response) {
          throw new Error('delete_group_failed');
        }
        message.success('删除分组成功');
        setDangerConfirmName('');
        setShowDangerOptions(false);
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

  async function handleSaveGroupSettings(values: GroupSettingForm) {
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

  const groupMemberCountTitle = `${selectedGroup?.group_name || '当前'} 分组成员 (${groupMembers.length}) 人`;
  const sortedMembers = [...groupMembers].sort((a, b) => {
    const rank = (r?: string) => { if (r === 'owner') return 0; if (r === 'dev') return 1; if (r === 'guest') return 2; return 99; };
    return rank(a.role) - rank(b.role);
  });

  function openAddMemberModal() {
    setMemberUidInput('');
    setMemberSelectedUids([]);
    setMemberUserOptions([]);
    setMemberRoleInput('dev');
    setAddMemberOpen(true);
  }

  function openCreateGroupModal() {
    createGroupForm.resetFields();
    setOwnerUserOptions([]);
    setCreateGroupOpen(true);
  }

  function handleSelectGroup(nextGroupId: number) {
    setGroupId(nextGroupId);
    setActiveTab('projects');
    navigate(`/group/${nextGroupId}`, { replace: true });
  }

  async function handleChangeMemberRole(uid: number, role: GroupMemberRole) {
    const response = await callApi(
      changeGroupMemberRole({ id: groupId, member_uid: uid, role }).unwrap(),
      '更新成员角色失败'
    );
    if (!response) return;
    message.success('更新成功');
    await groupMemberQuery.refetch();
  }

  async function handleDeleteMember(uid: number) {
    const response = await callApi(
      delGroupMember({ id: groupId, member_uid: uid }).unwrap(),
      '删除成员失败'
    );
    if (!response) return;
    message.success('删除成功');
    await groupMemberQuery.refetch();
  }

  const tabItems: Array<{ key: ConsoleTabKey; label: string; children: ReactNode }> = [
    {
      key: 'projects',
      label: '项目列表',
      children: (
        <ProjectConsoleProjectTab
          selectedGroupName={selectedGroup?.group_name || ''}
          groupType={groupType}
          projectRows={projectRows}
          normalProjects={normalProjects}
          followedProjects={followedProjects}
          mixedPublicProjects={mixedPublicProjects}
          projectListFetching={projectListQuery.isFetching}
          canCreateProject={canCreateProject}
          canCopyProject={canCopyProject}
          onAddProject={() => navigate('/add-project')}
          onNavigateProject={projectId => navigate(`/project/${projectId}`)}
          onToggleFollow={handleToggleFollow}
          onOpenCopyProject={project => {
            setCopyProjectTarget(project);
            copyForm.setFieldsValue({ project_name: `${project.name || ''}_copy` });
            setCopyModalOpen(true);
          }}
        />
      )
    }
  ];

  if (showMembers) {
    tabItems.push({
      key: 'members',
      label: '成员列表',
      children: (
        <ProjectConsoleMembersTab
          groupMemberCountTitle={groupMemberCountTitle}
          canManageGroupMembers={canManageGroupMembers}
          members={sortedMembers}
          loading={
            groupMemberQuery.isLoading ||
            delGroupMemberState.isLoading ||
            changeGroupMemberRoleState.isLoading
          }
          onOpenAddMember={openAddMemberModal}
          onChangeMemberRole={(uid, role) => handleChangeMemberRole(uid, role)}
          onDeleteMember={uid => handleDeleteMember(uid)}
        />
      )
    });
  }

  if (showActivity) {
    tabItems.push({
      key: 'activity',
      label: '分组动态',
      children: <ProjectConsoleActivityTab groupId={groupId} />
    });
  }

  if (showSetting) {
    tabItems.push({
      key: 'setting',
      label: '分组设置',
      children: (
        <ProjectConsoleSettingTab
          form={settingGroupForm}
          selectedGroupName={String(selectedGroup?.group_name || '')}
          customFieldRule={customFieldRule}
          updateLoading={updateGroupState.isLoading}
          canDeleteGroup={canDeleteGroup}
          showDangerOptions={showDangerOptions}
          dangerConfirmName={dangerConfirmName}
          dangerConfirmMatched={dangerConfirmName.trim() === String(selectedGroup?.group_name || '').trim()}
          deleteLoading={delGroupState.isLoading}
          onSave={values => void handleSaveGroupSettings(values)}
          onToggleDanger={() => setShowDangerOptions(v => !v)}
          onDangerConfirmNameChange={setDangerConfirmName}
          onDeleteGroup={() => void handleDeleteGroup()}
        />
      )
    });
  }

  return (
    <AppShell className="legacy-project-console-page">
      <PageHeader
        title="项目控制台"
        subtitle={`${selectedGroup?.group_name || '当前分组'} · ${projectRows.length} 个项目 · ${groups.length} 个分组`}
        actions={
          <Space>
            <Button onClick={openCreateGroupModal}>新建分组</Button>
            {canCreateProject ? (
              <Button type="primary" onClick={() => navigate('/add-project')}>
                新建项目
              </Button>
            ) : null}
          </Space>
        }
      />

      <div className="projectGround">
        <Layout className="legacy-project-console-layout">
          <Sider className="legacy-project-console-sider" width={200}>
            <ProjectConsoleSidebar
              guideVisible={guideVisible}
              guideStep={guide.step}
              personalSpaceTip={personalSpaceTip}
              selectedGroupType={selectedGroup?.type}
              selectedGroupName={selectedGroup?.group_name}
              selectedGroupDesc={selectedGroup?.group_desc}
              groupKeyword={groupKeyword}
              onGroupKeywordChange={setGroupKeyword}
              loading={groupListQuery.isLoading}
              groups={filteredGroups}
              selectedGroupId={groupId}
              onSelectGroup={handleSelectGroup}
              onOpenCreateGroup={openCreateGroupModal}
              onGuideNext={guide.next}
              onGuideExit={guide.finish}
            />
          </Sider>

          <Layout>
            <Content className="legacy-project-console-content">
              <Tabs
                type="card"
                className="m-tab tabs-large legacy-project-console-tabs"
                activeKey={activeTab}
                onChange={key => {
                  if (isConsoleTabKey(key)) {
                    setActiveTab(key);
                  }
                }}
                items={tabItems}
              />
            </Content>
          </Layout>
        </Layout>
      </div>

      <ProjectConsoleModals
        createGroupOpen={createGroupOpen}
        createGroupLoading={addGroupState.isLoading}
        createGroupForm={createGroupForm}
        ownerUserOptions={ownerUserOptions}
        onSearchOwnerUsers={value => {
          void handleSearchOwnerUsers(value);
        }}
        onCancelCreateGroup={() => setCreateGroupOpen(false)}
        onSubmitCreateGroup={values => {
          void handleCreateGroup(values);
        }}
        copyModalOpen={copyModalOpen}
        copyModalLoading={copyProjectState.isLoading}
        copyProjectName={copyProjectTarget?.name}
        copyForm={copyForm}
        onCancelCopyModal={() => {
          setCopyModalOpen(false);
          setCopyProjectTarget(null);
        }}
        onSubmitCopy={values => {
          void handleCopyProject(values);
        }}
        addMemberOpen={addMemberOpen}
        addMemberLoading={addGroupMemberState.isLoading}
        memberSelectedUids={memberSelectedUids}
        memberUserOptions={memberUserOptions}
        memberUidInput={memberUidInput}
        memberRoleInput={memberRoleInput}
        onSearchMemberUsers={value => {
          void handleSearchMemberUsers(value);
        }}
        onMemberSelectedUidsChange={setMemberSelectedUids}
        onMemberUidInputChange={setMemberUidInput}
        onMemberRoleInputChange={setMemberRoleInput}
        onCancelAddMember={() => setAddMemberOpen(false)}
        onSubmitAddMember={() => {
          void handleAddGroupMember();
        }}
      />
    </AppShell>
  );
}
