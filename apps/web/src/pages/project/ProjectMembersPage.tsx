import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import {
  useAddProjectMemberMutation,
  useChangeProjectMemberRoleMutation,
  useChangeProjectMemberEmailNoticeMutation,
  useDelProjectMemberMutation,
  useGetGroupMemberListQuery,
  useGetGroupQuery,
  useGetProjectListQuery,
  useGetProjectMemberListQuery,
  useGetProjectQuery,
  useGetUserStatusQuery,
  useLazyGetProjectMemberListQuery
} from '../../services/yapi-api';
import { LegacyErrMsg } from '../../components/LegacyErrMsg';
import { PageHeader, SectionCard } from '../../components/layout';

import './ProjectSetting.scss';

const { Text } = Typography;

type ProjectMembersPageProps = {
  projectId: number;
};

type MemberRole = 'owner' | 'dev' | 'guest';

export function ProjectMembersPage(props: ProjectMembersPageProps) {
  const [memberUid, setMemberUid] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[]>([]);
  const [memberRole, setMemberRole] = useState<MemberRole>('dev');
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedImportProjectId, setSelectedImportProjectId] = useState<number | null>(null);

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

  const rows = useMemo(() => {
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
            value: uid,
            label: email ? `${username} (${email})` : `${username} (${uid})`
          };
        })
        .filter(Boolean) as Array<{ value: number; label: string }>,
    [groupMembers]
  );
  const importProjectOptions = useMemo(() => {
    const list = groupProjectListQuery.data?.data?.list || [];
    return list
      .filter(item => Number(item._id || 0) !== props.projectId)
      .map(item => ({
        value: Number(item._id || 0),
        label: item.name || String(item._id || 0)
      }));
  }, [groupProjectListQuery.data, props.projectId]);

  function normalizeRole(role?: string): string {
    if (role === 'owner') return '组长';
    if (role === 'dev') return '开发者';
    if (role === 'guest') return '访客';
    return role || '-';
  }

  async function handleAdd() {
    const uidListFromInput = memberUid
      .split(/[,，]/)
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    const memberUids = Array.from(new Set([...selectedMemberUids, ...uidListFromInput]));
    if (memberUids.length === 0) {
      message.error('请输入合法 UID，可使用逗号分隔多个 UID');
      return;
    }
    const response = await addMember({
      id: props.projectId,
      member_uids: memberUids,
      role: memberRole
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '添加成员失败');
      return;
    }
    const payload = (response.data || {}) as Record<string, unknown>;
    const addMembers = Array.isArray(payload.add_members) ? payload.add_members.length : 0;
    const existMembers = Array.isArray(payload.exist_members) ? payload.exist_members.length : 0;
    setMemberUid('');
    setSelectedMemberUids([]);
    setAddMemberModalOpen(false);
    if (addMembers > 0 || existMembers > 0) {
      message.success(`添加成功，已成功添加 ${addMembers} 人，其中 ${existMembers} 人已存在`);
    } else {
      message.success('成员已添加');
    }
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
      message.error('请选择项目');
      return;
    }

    const response = await loadProjectMembers({ id: targetProjectId }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '读取项目成员失败');
      return;
    }

    const members = response.data || [];
    const memberUids = members
      .map(item => Number(item.uid || 0))
      .filter(uid => Number.isFinite(uid) && uid > 0);
    if (memberUids.length === 0) {
      message.warning('所选项目没有可导入成员');
      return;
    }

    const importResponse = await addMember({
      id: props.projectId,
      member_uids: memberUids,
      role: 'dev'
    }).unwrap();
    if (importResponse.errcode !== 0) {
      message.error(importResponse.errmsg || '批量导入成员失败');
      return;
    }

    setImportModalOpen(false);
    setSelectedImportProjectId(null);
    message.success('批量导入成员成功');
    await listQuery.refetch();
  }

  return (
    <div className="legacy-page-shell legacy-members-page">
      <PageHeader
        title="成员管理"
        subtitle={`项目 ${project?.name || props.projectId} · 当前成员 ${rows.length} 人${canManage ? '' : '（只读）'}`}
        actions={
          canManage ? (
            <Space size={8}>
              <Button type="primary" onClick={openAddMemberModal}>
                添加成员
              </Button>
              <Button onClick={() => setImportModalOpen(true)}>批量导入成员</Button>
            </Space>
          ) : null
        }
      />

      <SectionCard title="项目成员" className="legacy-members-main-card">
        <Table
          className="setting-project-member"
          rowKey={(item: { uid?: number }) => Number(item.uid || 0)}
          loading={
            listQuery.isLoading ||
            delState.isLoading ||
            roleState.isLoading ||
            emailNoticeState.isLoading
          }
          dataSource={rows as Array<Record<string, unknown>>}
          pagination={false}
          locale={{
            emptyText: <LegacyErrMsg type="noMemberInProject" />
          }}
          columns={[
            {
              title: '成员',
              dataIndex: 'username',
              render: (value, row: Record<string, unknown>) => {
                const uid = Number(row.uid || 0);
                const canSwitchNotice = canManage || uid === currentUid;
                const displayName = String(value || row.email || uid);
                return (
                  <div className="legacy-member-cell">
                    <Avatar src={`/api/user/avatar?uid=${uid}`} size={32} />
                    <span>{displayName}</span>
                    {uid === currentUid ? <Tag color="blue">我</Tag> : null}
                    <Tooltip placement="top" title="消息通知">
                      <span>
                        <Switch
                          checkedChildren="开"
                          unCheckedChildren="关"
                          checked={Boolean(row.email_notice)}
                          disabled={!canSwitchNotice}
                          onChange={async checked => {
                            const response = await changeEmailNotice({
                              id: props.projectId,
                              member_uid: uid,
                              notice: checked
                            }).unwrap();
                            if (response.errcode !== 0) {
                              message.error(response.errmsg || '更新通知设置失败');
                              return;
                            }
                            await listQuery.refetch();
                          }}
                        />
                      </span>
                    </Tooltip>
                  </div>
                );
              }
            },
            {
              title: '角色',
              width: 200,
              render: (_, row: Record<string, unknown>) => {
                const uid = Number(row.uid || 0);
                const role = String(row.role || '');
                if (canManage) {
                  return (
                    <Select<MemberRole>
                      value={(role as MemberRole) || 'dev'}
                      className="select legacy-members-role-select"
                      onChange={async newRole => {
                        const response = await changeRole({
                          id: props.projectId,
                          member_uid: uid,
                          role: newRole
                        }).unwrap();
                        if (response.errcode !== 0) {
                          message.error(response.errmsg || '修改角色失败');
                          return;
                        }
                        message.success('成员角色已更新');
                        await listQuery.refetch();
                      }}
                      options={[
                        { value: 'owner', label: '组长' },
                        { value: 'dev', label: '开发者' },
                        { value: 'guest', label: '访客' }
                      ]}
                    />
                  );
                }
                return <Tag>{normalizeRole(role)}</Tag>;
              }
            },
            {
              title: '操作',
              width: 96,
              align: 'right',
              render: (_, row: Record<string, unknown>) => {
                const uid = Number(row.uid || 0);
                if (!canManage) {
                  return '-';
                }
                return (
                  <Popconfirm
                    placement="topRight"
                    title="你确定要删除吗?"
                    okText="确定"
                    cancelText="取消"
                    onConfirm={async () => {
                      const response = await delMember({
                        id: props.projectId,
                        member_uid: uid
                      }).unwrap();
                      if (response.errcode !== 0) {
                        message.error(response.errmsg || '删除成员失败');
                        return;
                      }
                      message.success('成员已移除');
                      await listQuery.refetch();
                    }}
                  >
                    <Button danger className="btn-danger">
                      删除
                    </Button>
                  </Popconfirm>
                );
              }
            }
          ]}
        />
      </SectionCard>

      <SectionCard
        title={`${groupQuery.data?.data?.group_name || '分组'} 成员池`}
        extra={<Text type="secondary">{groupMembers.length} 人</Text>}
        className="legacy-group-members-card"
      >
        {groupMembers.length === 0 ? (
          <LegacyErrMsg type="noMemberInGroup" />
        ) : (
          <div className="legacy-group-members-grid">
            {groupMembers.map(item => (
              <div key={Number(item.uid || 0)} className="legacy-group-member-item">
                <Avatar size={40} src={`/api/user/avatar?uid=${item.uid}`} />
                <div className="legacy-group-member-name">
                  {String(item.username || item.uid || '-')}
                  {Number(item.uid || 0) === currentUid ? <Tag color="blue">我</Tag> : null}
                </div>
                <div className="legacy-group-member-role">{normalizeRole(item.role)}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        title="添加成员"
        open={addMemberModalOpen}
        onCancel={() => setAddMemberModalOpen(false)}
        onOk={() => void handleAdd()}
        okButtonProps={{ loading: addState.isLoading }}
      >
        <Space direction="vertical" className="legacy-members-modal-stack">
          <Select
            mode="multiple"
            allowClear
            showSearch
            value={selectedMemberUids}
            onChange={value => {
              const next = (value as Array<number | string>)
                .map(item => Number(item))
                .filter(item => Number.isFinite(item) && item > 0);
              setSelectedMemberUids(next);
            }}
            placeholder="从分组成员中选择"
            options={groupMemberOptions}
            optionFilterProp="label"
            className="legacy-members-modal-select"
          />
          <Input
            value={memberUid}
            onChange={event => setMemberUid(event.target.value)}
            placeholder="手动补充 UID（多个请用逗号分隔）"
          />
          <Select<MemberRole>
            value={memberRole}
            onChange={setMemberRole}
            options={[
              { value: 'owner', label: '组长' },
              { value: 'dev', label: '开发者' },
              { value: 'guest', label: '访客' }
            ]}
            className="legacy-members-modal-select"
          />
        </Space>
      </Modal>

      <Modal
        title="批量导入成员"
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setSelectedImportProjectId(null);
        }}
        onOk={() => void handleBatchImportMembers()}
        okText="导入"
      >
        <Space direction="vertical" className="legacy-members-modal-stack">
          <Text type="secondary">从同分组项目导入成员到当前项目。</Text>
          <Select<number>
            showSearch
            placeholder="请选择项目名称"
            value={selectedImportProjectId ?? undefined}
            loading={groupProjectListQuery.isFetching}
            onChange={value => setSelectedImportProjectId(value)}
            options={importProjectOptions}
            className="legacy-members-modal-select"
            optionFilterProp="label"
          />
        </Space>
      </Modal>
    </div>
  );
}
