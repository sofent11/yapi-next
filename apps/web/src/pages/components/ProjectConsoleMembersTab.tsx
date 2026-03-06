import { Link } from 'react-router-dom';
import { Avatar, Button, Loader, Select, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { LegacyErrMsg } from '../../components/LegacyErrMsg';

type GroupMemberRole = 'owner' | 'dev' | 'guest';

type GroupMemberRow = {
  uid?: number;
  username?: string;
  email?: string;
  role?: string;
};

type ProjectConsoleMembersTabProps = {
  groupMemberCountTitle: string;
  canManageGroupMembers: boolean;
  members: GroupMemberRow[];
  loading: boolean;
  onOpenAddMember: () => void;
  onChangeMemberRole: (uid: number, role: GroupMemberRole) => Promise<void>;
  onDeleteMember: (uid: number) => Promise<void>;
};

function roleLabel(role?: string): string {
  if (role === 'owner') return '组长';
  if (role === 'dev') return '开发者';
  if (role === 'guest') return '访客';
  return '-';
}

export function ProjectConsoleMembersTab(props: ProjectConsoleMembersTabProps) {
  const ownerCount = props.members.filter(item => item.role === 'owner').length;
  const devCount = props.members.filter(item => item.role === 'dev').length;
  const guestCount = props.members.filter(item => item.role === 'guest').length;

  return (
    <div className="m-panel">
      <div className="console-members-toolbar">
        <div className="console-members-toolbar-main">
          <Text fw={700}>{props.groupMemberCountTitle}</Text>
          <div className="console-members-summary inline-flex flex-wrap gap-2">
            <span className="console-members-summary-chip">组长 {ownerCount}</span>
            <span className="console-members-summary-chip">开发者 {devCount}</span>
            <span className="console-members-summary-chip">访客 {guestCount}</span>
          </div>
        </div>
        {props.canManageGroupMembers ? (
          <Button onClick={props.onOpenAddMember}>添加成员</Button>
        ) : null}
      </div>

      {props.loading ? (
        <div className="flex justify-center py-12">
          <Loader />
        </div>
      ) : props.members.length === 0 ? (
        <LegacyErrMsg type="noMemberInGroup" />
      ) : (
        <div className="overflow-x-auto">
          <table className="console-members-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">成员信息</th>
                <th className="px-4 py-3 text-left">权限</th>
              </tr>
            </thead>
            <tbody>
              {props.members.map(row => {
                const uid = Number(row.uid || 0);
                const value = (row.role as GroupMemberRole) || 'dev';
                const username = String(row.username || '-');
                const email = String(row.email || '');

                return (
                  <tr key={uid} className={`console-members-row-${String(row.role || 'guest')}`}>
                    <td className="px-4 py-4">
                      <div className="console-members-cell">
                        <Link to={`/user/profile/${uid}`}>
                          <Avatar src={`/api/user/avatar?uid=${uid}`} size={36} />
                        </Link>
                        <div className="console-members-meta">
                          <Link to={`/user/profile/${uid}`} className="console-members-name-link">
                            {username}
                          </Link>
                          {email ? <div className="console-members-email">{email}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {!props.canManageGroupMembers ? (
                        <span className="console-members-role-text">{roleLabel(value)}</span>
                      ) : (
                        <div className="console-members-actions flex flex-wrap items-center gap-3">
                          <Select
                            value={value}
                            onChange={role => {
                              if (role) {
                                void props.onChangeMemberRole(uid, role as GroupMemberRole);
                              }
                            }}
                            data={[
                              { value: 'owner', label: '组长' },
                              { value: 'dev', label: '开发者' },
                              { value: 'guest', label: '访客' }
                            ]}
                            className="console-members-role-select"
                          />
                          <Button
                            color="red"
                            variant="light"
                            size="xs"
                            onClick={() =>
                              modals.openConfirmModal({
                                title: '确认删除该成员？',
                                labels: { confirm: '移除', cancel: '取消' },
                                confirmProps: { color: 'red' },
                                onConfirm: () => void props.onDeleteMember(uid)
                              })
                            }
                          >
                            移除
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
