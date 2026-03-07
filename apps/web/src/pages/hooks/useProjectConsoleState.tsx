import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Alert } from '@mantine/core';
import { useForm as useRcForm, useWatch as useRcWatch } from 'rc-field-form';
import type { GroupListItem, ProjectListItem, UserSearchItem } from '@yapi-next/shared-types';
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
} from '../../services/yapi-api';
import type { GroupSettingForm } from '../components/ProjectConsoleSettingTab';
import { useGuide } from '../../context/GuideContext';
import { safeApiRequest } from '../../utils/safe-request';
import type {
  ConsoleTabKey,
  CopyForm,
  CreateGroupForm,
  GroupMemberRole
} from '../ProjectConsolePage.types';
import {
  canShowGroupSetting,
  isConsoleTabKey,
  normalizeGroups
} from '../ProjectConsolePage.utils';

function showNotification(color: 'red' | 'teal' | 'yellow' | 'blue', message: string) {
  notifications.show({ color, message });
}

const message = {
  success(text: string) {
    showNotification('teal', text);
  },
  error(text: string) {
    showNotification('red', text);
  },
  warning(text: string) {
    showNotification('yellow', text);
  },
  info(text: string) {
    showNotification('blue', text);
  }
};

export function useProjectConsoleState() {
  const navigate = useNavigate();
  const params = useParams<{ groupId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeGroupId = Number(params.groupId || 0);

  const [createGroupForm] = useRcForm<CreateGroupForm>();
  const [settingGroupForm] = useRcForm<GroupSettingForm>();
  const [copyForm] = useRcForm<CopyForm>();
  const customFieldName = useRcWatch('custom_field1_name', settingGroupForm);
  const customFieldEnable = useRcWatch('custom_field1_enable', settingGroupForm);

  const [groupKeyword, setGroupKeyword] = useState('');
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
  const guide = useGuide();
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
  const showMembers = groupType === 'public';
  const showActivity = /(admin|owner|dev|guest)/.test(groupRole) || userRole === 'admin';
  const showSetting = canShowGroupSetting(userRole, groupRole, groupType);
  const requestedTab = searchParams.get('tab') || '';
  const activeTab: ConsoleTabKey = useMemo(() => {
    const nextTab = isConsoleTabKey(requestedTab) ? requestedTab : 'projects';
    if (nextTab === 'members' && !showMembers) return 'projects';
    if (nextTab === 'activity' && !showActivity) return 'projects';
    if (nextTab === 'setting' && !showSetting) return 'projects';
    return nextTab;
  }, [requestedTab, showActivity, showMembers, showSetting]);

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

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (activeTab === 'projects') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', activeTab);
    }
    const current = searchParams.toString();
    const next = nextParams.toString();
    if (current !== next) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const groupMemberCountTitle = `${selectedGroup?.group_name || '当前'} 分组成员 (${groupMembers.length}) 人`;
  const sortedMembers = [...groupMembers].sort((a, b) => {
    const rank = (r?: string) => {
      if (r === 'owner') return 0;
      if (r === 'dev') return 1;
      if (r === 'guest') return 2;
      return 99;
    };
    return rank(a.role) - rank(b.role);
  });

  const canCreateProject = /(admin|owner|dev)/.test(groupRole) || userRole === 'admin';
  const canCopyProject = /(admin|owner|dev)/.test(groupRole) || userRole === 'admin';
  const canManageGroupMembers = userRole === 'admin' || groupRole === 'owner';
  const canDeleteGroup = userRole === 'admin' && groupType !== 'private';

  // --- Handlers ---

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
    modals.openConfirmModal({
      title: `确认删除 ${selectedGroup.group_name} 分组吗？`,
      labels: { confirm: '确认删除', cancel: '取消' },
      confirmProps: { color: 'red', loading: delGroupState.isLoading },
      children: (
        <div className="console-danger-confirm-content space-y-3">
          <Alert color="yellow" title="此操作会删除该分组下所有项目和接口，且无法恢复。" />
          <div>
            已确认分组名: <b>{inputName}</b>
          </div>
        </div>
      ),
      onConfirm: async () => {
        const response = await callApi(delGroup({ id: groupId }).unwrap(), '删除分组失败');
        if (!response) {
          throw new Error('delete_group_failed');
        }
        message.success('删除分组成功');
        setDangerConfirmName('');
        setShowDangerOptions(false);
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

  async function handleToggleFollow(project: ProjectListItem, event: ReactMouseEvent<HTMLElement>) {
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
    navigate(`/group/${nextGroupId}`, { replace: true });
  }

  return {
    // Navigation
    navigate,
    searchParams,
    setSearchParams,

    // Group state
    groupId,
    groups,
    filteredGroups,
    selectedGroup,
    groupType,
    groupRole,
    userRole,
    groupKeyword,
    setGroupKeyword,
    groupListLoading: groupListQuery.isLoading,

    // Tab state
    activeTab,

    // Permissions
    showMembers,
    showActivity,
    showSetting,
    canCreateProject,
    canCopyProject,
    canManageGroupMembers,
    canDeleteGroup,

    // Project data
    projectRows,
    normalProjects,
    followedProjects,
    mixedPublicProjects,
    projectListFetching: projectListQuery.isFetching,

    // Member data
    sortedMembers,
    groupMemberCountTitle,
    memberLoading:
      groupMemberQuery.isLoading ||
      delGroupMemberState.isLoading ||
      changeGroupMemberRoleState.isLoading,

    // Guide
    guide,

    // Create group modal
    createGroupOpen,
    createGroupLoading: addGroupState.isLoading,
    createGroupForm,
    ownerUserOptions,
    onSearchOwnerUsers: (v: string) => { void handleSearchOwnerUsers(v); },
    onCancelCreateGroup: () => setCreateGroupOpen(false),
    onSubmitCreateGroup: (v: CreateGroupForm) => { void handleCreateGroup(v); },

    // Copy project modal
    copyModalOpen,
    copyModalLoading: copyProjectState.isLoading,
    copyProjectTarget,
    copyForm,
    onCancelCopyModal: () => {
      setCopyModalOpen(false);
      setCopyProjectTarget(null);
    },
    onSubmitCopy: (v: CopyForm) => { void handleCopyProject(v); },

    // Add member modal
    addMemberOpen,
    addMemberLoading: addGroupMemberState.isLoading,
    memberSelectedUids,
    memberUserOptions,
    memberUidInput,
    memberRoleInput,
    onSearchMemberUsers: (v: string) => { void handleSearchMemberUsers(v); },
    onMemberSelectedUidsChange: setMemberSelectedUids,
    onMemberUidInputChange: setMemberUidInput,
    onMemberRoleInputChange: setMemberRoleInput,
    onCancelAddMember: () => setAddMemberOpen(false),
    onSubmitAddMember: () => { void handleAddGroupMember(); },

    // Setting tab
    settingGroupForm,
    customFieldRule,
    updateLoading: updateGroupState.isLoading,
    showDangerOptions,
    dangerConfirmName,
    deleteLoading: delGroupState.isLoading,
    onSaveSettings: (v: GroupSettingForm) => { void handleSaveGroupSettings(v); },
    onToggleDanger: () => setShowDangerOptions(v => !v),
    onDangerConfirmNameChange: setDangerConfirmName,
    onDeleteGroup: () => { void handleDeleteGroup(); },

    // Actions
    openCreateGroupModal,
    openAddMemberModal,
    handleSelectGroup,
    handleToggleFollow,
    handleChangeMemberRole: (uid: number, role: GroupMemberRole) => handleChangeMemberRole(uid, role),
    handleDeleteMember: (uid: number) => handleDeleteMember(uid),
    onOpenCopyProject: (project: ProjectListItem) => {
      setCopyProjectTarget(project);
      copyForm.setFieldsValue({ project_name: `${project.name || ''}_copy` });
      setCopyModalOpen(true);
    }
  };
}
