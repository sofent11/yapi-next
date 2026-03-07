import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Modal,
  MultiSelect,
  Select,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  useAddProjectMemberMutation,
  useChangeProjectMemberEmailNoticeMutation,
  useChangeProjectMemberRoleMutation,
  useDelProjectMemberMutation,
  useGetGroupMemberListQuery,
  useGetGroupQuery,
  useGetProjectListQuery,
  useGetProjectMemberListQuery,
  useGetProjectQuery,
  useGetUserStatusQuery,
  useLazyGetProjectMemberListQuery
} from '../../services/yapi-api';
import { AppEmptyState } from '../../components/AppEmptyState';
import { AdaptiveDataView } from '../../components/patterns/AdaptiveDataView';
import { AsyncState } from '../../components/patterns/AsyncState';
import { DataToolbar } from '../../components/patterns/DataToolbar';
import { SectionCard } from '../../components/layout';

type ProjectMembersPageProps = {
  projectId: number;
};

type MemberRole = 'owner' | 'dev' | 'guest';
type MemberRow = Record<string, unknown> & {
  uid?: number;
  username?: string;
  email?: string;
  role?: string;
  email_notice?: boolean;
};

const roleOptions = [
  { value: 'owner', label: '组长' },
  { value: 'dev', label: '开发者' },
  { value: 'guest', label: '访客' }
] as const;

function showNotification(color: 'teal' | 'red' | 'yellow', message: string) {
  notifications.show({ color, message });
}

function normalizeRole(role?: string): string {
  if (role === 'owner') return '组长';
  if (role === 'dev') return '开发者';
  if (role === 'guest') return '访客';
  return role || '-';
}

export function ProjectMembersPage(props: ProjectMembersPageProps) {
  const [memberUid, setMemberUid] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<string[]>([]);
  const [memberRole, setMemberRole] = useState<MemberRole>('dev');
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedImportProjectId, setSelectedImportProjectId] = useState<string | null>(null);

  const statusQuery = useGetUserStatusQuery();
  const currentUid = Number(statusQuery.data?.data?._id || statusQuery.data?.data?.uid || 0);
  const currentUserRole = String(statusQuery.data?.data?.role || '');

  const projectDetailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const project = projectDetailQuery.data?.data;
  const groupId = Number(project?.group_id || 0);
  const projectRole = String(project?.role || '');
  const canManage = projectRole === 'owner' || projectRole === 'admin' || currentUserRole === 'admin';
  const groupQuery = useGetGroupQuery({ id: groupId }, { skip: groupId <= 0 });

  const listQuery = useGetProjectMemberListQuery(
    { id: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [loadProjectMembers] = useLazyGetProjectMemberListQuery();
  const groupMembersQuery = useGetGroupMemberListQuery(
    { id: groupId },
    { skip: groupId <= 0 }
  );
  const groupProjectListQuery = useGetProjectListQuery(
    { groupId },
    { skip: groupId <= 0 || !importModalOpen }
  );
  const [addMember, addState] = useAddProjectMemberMutation();
  const [delMember, delState] = useDelProjectMemberMutation();
  const [changeRole, roleState] = useChangeProjectMemberRoleMutation();
  const [changeEmailNotice, emailNoticeState] = useChangeProjectMemberEmailNoticeMutation();

  const rows = useMemo<MemberRow[]>(() => {
    const rank = (role?: string) => {
      if (role === 'owner') return 0;
      if (role === 'dev') return 1;
      if (role === 'guest') return 2;
      return 99;
    };
    return [...(listQuery.data?.data || [])].sort((a, b) => rank(a.role) - rank(b.role));
  }, [listQuery.data]);

  const groupMembers = groupMembersQuery.data?.data || [];
  const groupMemberOptions = useMemo(
    () =>
      groupMembers
        .map(item => {
          const uid = Number(item.uid || 0);
          if (!uid) return null;
          const username = String(item.username || uid);
          const email = String(item.email || '');
          return {
            value: String(uid),
            label: email ? `${username} (${email})` : `${username} (${uid})`
          };
        })
        .filter(Boolean) as Array<{ value: string; label: string }>,
    [groupMembers]
  );
  const importProjectOptions = useMemo(() => {
    const list = groupProjectListQuery.data?.data?.list || [];
    return list
      .filter(item => Number(item._id || 0) !== props.projectId)
      .map(item => ({
        value: String(item._id || 0),
        label: item.name || String(item._id || 0)
      }));
  }, [groupProjectListQuery.data, props.projectId]);

  async function handleAdd() {
    const uidListFromInput = memberUid
      .split(/[,，]/)
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    const memberUids = Array.from(
      new Set([...selectedMemberUids.map(item => Number(item)), ...uidListFromInput])
    );
    if (memberUids.length === 0) {
      showNotification('red', '请输入合法 UID，可使用逗号分隔多个 UID');
      return;
    }
    const response = await addMember({
      id: props.projectId,
      member_uids: memberUids,
      role: memberRole
    }).unwrap();
    if (response.errcode !== 0) {
      showNotification('red', response.errmsg || '添加成员失败');
      return;
    }
    const payload = (response.data || {}) as Record<string, unknown>;
    const addMembers = Array.isArray(payload.add_members) ? payload.add_members.length : 0;
    const existMembers = Array.isArray(payload.exist_members) ? payload.exist_members.length : 0;
    setMemberUid('');
    setSelectedMemberUids([]);
    setAddMemberModalOpen(false);
    showNotification(
      'teal',
      addMembers > 0 || existMembers > 0
        ? `添加成功，已成功添加 ${addMembers} 人，其中 ${existMembers} 人已存在`
        : '成员已添加'
    );
    await listQuery.refetch();
  }

  function openAddMemberModal() {
    setMemberUid('');
    setSelectedMemberUids([]);
    setMemberRole('dev');
    setAddMemberModalOpen(true);
  }

  async function handleBatchImportMembers() {
    const targetProjectId = Number(selectedImportProjectId || 0);
    if (!targetProjectId) {
      showNotification('red', '请选择项目');
      return;
    }

    const response = await loadProjectMembers({ id: targetProjectId }).unwrap();
    if (response.errcode !== 0) {
      showNotification('red', response.errmsg || '读取项目成员失败');
      return;
    }

    const members = response.data || [];
    const memberUids = members
      .map(item => Number(item.uid || 0))
      .filter(uid => Number.isFinite(uid) && uid > 0);
    if (memberUids.length === 0) {
      showNotification('yellow', '所选项目没有可导入成员');
      return;
    }

    const importResponse = await addMember({
      id: props.projectId,
      member_uids: memberUids,
      role: 'dev'
    }).unwrap();
    if (importResponse.errcode !== 0) {
      showNotification('red', importResponse.errmsg || '批量导入成员失败');
      return;
    }

    setImportModalOpen(false);
    setSelectedImportProjectId(null);
    showNotification('teal', '批量导入成员成功');
    await listQuery.refetch();
  }

  function confirmDelete(uid: number) {
    modals.openConfirmModal({
      title: '你确定要删除吗?',
      labels: { confirm: '确定', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const response = await delMember({
          id: props.projectId,
          member_uid: uid
        }).unwrap();
        if (response.errcode !== 0) {
          showNotification('red', response.errmsg || '删除成员失败');
          return;
        }
        showNotification('teal', '成员已移除');
        await listQuery.refetch();
      }
    });
  }

  const loading =
    listQuery.isLoading ||
    delState.isLoading ||
    roleState.isLoading ||
    emailNoticeState.isLoading;

  return (
    <div className="page-shell project-members-page">
      <SectionCard className="project-members-card">
        <DataToolbar
          title="项目成员"
          summary={`当前项目共有 ${rows.length} 位成员${canManage ? '，可直接调整角色与通知开关。' : '，当前为只读模式。'}`}
          actions={
            canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={openAddMemberModal}>添加成员</Button>
                <Button variant="default" onClick={() => setImportModalOpen(true)}>
                  批量导入成员
                </Button>
              </div>
            ) : null
          }
        />
        {loading && rows.length === 0 ? (
          <AsyncState state="loading" title="正在加载项目成员" description="成员资料和权限信息正在准备中。" />
        ) : rows.length === 0 ? (
          <AppEmptyState type="noMemberInProject" />
        ) : (
          <AdaptiveDataView
            desktop={
              <div className="overflow-x-auto rounded-2xl">
                <Table className="console-members-table" highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>成员信息</Table.Th>
                      <Table.Th>权限</Table.Th>
                      <Table.Th className="text-right">操作</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map(row => {
                      const uid = Number(row.uid || 0);
                      const role = String(row.role || '');
                      const canSwitchNotice = canManage || uid === currentUid;
                      const displayName = String(row.username || row.email || uid);

                      return (
                        <Table.Tr
                          key={uid}
                          className={
                            role === 'owner'
                              ? 'console-members-row-owner'
                              : role === 'guest'
                                ? 'console-members-row-guest'
                                : 'console-members-row-dev'
                          }
                        >
                          <Table.Td>
                            <div className="console-members-cell">
                              <Avatar src={`/api/user/avatar?uid=${uid}`} size={32} />
                              <div className="console-members-meta min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="console-members-name-link truncate">{displayName}</span>
                                  {uid === currentUid ? <Badge color="blue">我</Badge> : null}
                                </div>
                                <span className="console-members-email truncate">{String(row.email || `UID ${uid}`)}</span>
                              </div>
                              <Tooltip label="消息通知">
                                <div>
                                  <Switch
                                    checked={Boolean(row.email_notice)}
                                    disabled={!canSwitchNotice}
                                    onChange={async event => {
                                      const response = await changeEmailNotice({
                                        id: props.projectId,
                                        member_uid: uid,
                                        notice: event.currentTarget.checked
                                      }).unwrap();
                                      if (response.errcode !== 0) {
                                        showNotification('red', response.errmsg || '更新通知设置失败');
                                        return;
                                      }
                                      await listQuery.refetch();
                                    }}
                                  />
                                </div>
                              </Tooltip>
                            </div>
                          </Table.Td>
                          <Table.Td>
                            {canManage ? (
                              <Select
                                value={(role as MemberRole) || 'dev'}
                                className="console-members-role-select project-members-role-select"
                                data={roleOptions.map(item => ({ ...item }))}
                                onChange={async newRole => {
                                  if (!newRole) return;
                                  const response = await changeRole({
                                    id: props.projectId,
                                    member_uid: uid,
                                    role: newRole as MemberRole
                                  }).unwrap();
                                  if (response.errcode !== 0) {
                                    showNotification('red', response.errmsg || '修改角色失败');
                                    return;
                                  }
                                  showNotification('teal', '成员角色已更新');
                                  await listQuery.refetch();
                                }}
                              />
                            ) : (
                              <Badge variant="light" className="console-members-role-text">
                                {normalizeRole(role)}
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <div className="flex justify-end text-sm text-slate-500 dark:text-slate-400">
                              {canManage ? (
                                <Button color="red" variant="light" size="xs" onClick={() => confirmDelete(uid)}>
                                  删除
                                </Button>
                              ) : (
                                '-'
                              )}
                            </div>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            }
            mobile={
              <div className="adaptive-data-view-mobile">
                {rows.map(row => {
                  const uid = Number(row.uid || 0);
                  const role = String(row.role || '');
                  const canSwitchNotice = canManage || uid === currentUid;
                  const displayName = String(row.username || row.email || uid);

                  return (
                    <div key={uid} className="adaptive-data-card">
                      <div className="adaptive-data-card-head">
                        <div className="project-members-cell min-w-0">
                          <Avatar src={`/api/user/avatar?uid=${uid}`} size={36} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100">{displayName}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">{String(row.email || `UID ${uid}`)}</div>
                          </div>
                        </div>
                        {uid === currentUid ? <Badge color="blue">我</Badge> : null}
                      </div>
                      <div className="adaptive-data-card-grid">
                        <div>
                          <span className="adaptive-data-card-label">角色</span>
                          {canManage ? (
                            <Select
                              value={(role as MemberRole) || 'dev'}
                              className="project-members-role-select"
                              data={roleOptions.map(item => ({ ...item }))}
                              onChange={async newRole => {
                                if (!newRole) return;
                                const response = await changeRole({
                                  id: props.projectId,
                                  member_uid: uid,
                                  role: newRole as MemberRole
                                }).unwrap();
                                if (response.errcode !== 0) {
                                  showNotification('red', response.errmsg || '修改角色失败');
                                  return;
                                }
                                showNotification('teal', '成员角色已更新');
                                await listQuery.refetch();
                              }}
                            />
                          ) : (
                            <Badge variant="light" className="w-fit">
                              {normalizeRole(role)}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <span className="adaptive-data-card-label">消息通知</span>
                          <Switch
                            checked={Boolean(row.email_notice)}
                            disabled={!canSwitchNotice}
                            onChange={async event => {
                              const response = await changeEmailNotice({
                                id: props.projectId,
                                member_uid: uid,
                                notice: event.currentTarget.checked
                              }).unwrap();
                              if (response.errcode !== 0) {
                                showNotification('red', response.errmsg || '更新通知设置失败');
                                return;
                              }
                              await listQuery.refetch();
                            }}
                          />
                        </div>
                      </div>
                      {canManage ? (
                        <div className="adaptive-data-card-actions">
                          <Button color="red" variant="light" size="xs" onClick={() => confirmDelete(uid)}>
                            删除
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title={`${groupQuery.data?.data?.group_name || '分组'} 成员池`}
        extra={<Text c="dimmed">{groupMembers.length} 人</Text>}
        className="group-members-card"
      >
        {groupMembers.length === 0 ? (
          <AppEmptyState type="noMemberInGroup" />
        ) : (
          <div className="group-members-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {groupMembers.map(item => (
              <div
                key={Number(item.uid || 0)}
                className="group-members-item rounded-[var(--radius-lg)] border border-slate-200 bg-slate-50 p-4 dark:!border-[#24456f] dark:!bg-[#10294d]"
              >
                <Avatar size={40} src={`/api/user/avatar?uid=${item.uid}`} />
                <div className="group-members-name mt-3 flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  {String(item.username || item.uid || '-')}
                  {Number(item.uid || 0) === currentUid ? <Badge color="blue">我</Badge> : null}
                </div>
                <div className="group-members-role mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {normalizeRole(item.role)}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        title="添加成员"
        opened={addMemberModalOpen}
        onClose={() => setAddMemberModalOpen(false)}
      >
        <div className="space-y-4">
          <MultiSelect
            searchable
            clearable
            value={selectedMemberUids}
            onChange={setSelectedMemberUids}
            placeholder="从分组成员中选择"
            data={groupMemberOptions}
            className="project-members-modal-select"
          />
          <TextInput
            value={memberUid}
            onChange={event => setMemberUid(event.currentTarget.value)}
            placeholder="手动补充 UID（多个请用逗号分隔）"
          />
          <Select
            value={memberRole}
            onChange={value => setMemberRole((value as MemberRole) || 'dev')}
            data={roleOptions.map(item => ({ ...item }))}
            className="project-members-modal-select"
          />
          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => setAddMemberModalOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleAdd()} loading={addState.isLoading}>
              添加
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="批量导入成员"
        opened={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setSelectedImportProjectId(null);
        }}
      >
        <div className="space-y-4">
          <Text c="dimmed" size="sm">
            从同分组项目导入成员到当前项目。
          </Text>
          <Select
            searchable
            placeholder="请选择项目名称"
            value={selectedImportProjectId}
            disabled={groupProjectListQuery.isFetching}
            onChange={setSelectedImportProjectId}
            data={importProjectOptions}
            className="project-members-modal-select"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="default"
              onClick={() => {
                setImportModalOpen(false);
                setSelectedImportProjectId(null);
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleBatchImportMembers()}>导入</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
