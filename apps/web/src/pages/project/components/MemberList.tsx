import { Link } from 'react-router-dom';
import { Avatar, Button, Loader, Select, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import type { GroupMemberRole } from '../../ProjectConsolePage.types';

type GroupMemberListItem = {
  uid?: number;
  username?: string;
  email?: string;
  role?: string;
};

interface MemberListProps {
  groupMemberCountTitle: string;
  canManageGroupMembers: boolean;
  members: GroupMemberListItem[];
  loading: boolean;
  onOpenAddMember: () => void;
  onChangeMemberRole: (uid: number, role: GroupMemberRole) => void;
  onDeleteMember: (uid: number) => void;
}

function roleLabel(role?: string) {
  if (role === 'owner') return '组长';
  if (role === 'dev') return '开发者';
  if (role === 'guest') return '访客';
  return '-';
}

export function MemberList(props: MemberListProps) {
  const ownerCount = props.members.filter(item => item.role === 'owner').length;
  const devCount = props.members.filter(item => item.role === 'dev').length;
  const guestCount = props.members.filter(item => item.role === 'guest').length;

  return (
    <div className="m-panel legacy-console-member-panel">
      <div className="legacy-console-member-toolbar">
        <div className="legacy-console-member-toolbar-main">
          <Text fw={700}>{props.groupMemberCountTitle}</Text>
          <div className="legacy-console-member-summary inline-flex flex-wrap gap-2">
            <span className="legacy-console-member-summary-chip">组长 {ownerCount}</span>
            <span className="legacy-console-member-summary-chip">开发者 {devCount}</span>
            <span className="legacy-console-member-summary-chip">访客 {guestCount}</span>
          </div>
        </div>
        {props.canManageGroupMembers ? (
          <Button onClick={props.onOpenAddMember}>添加成员</Button>
        ) : (
          <Tooltip label="您没有权限,请联系该分组组长或管理员">
            <Button disabled>添加成员</Button>
          </Tooltip>
        )}
      </div>

      {props.loading ? (
        <div className="flex justify-center py-12">
          <Loader />
        </div>
      ) : props.members.length === 0 ? (
        <LegacyErrMsg type="noMemberInGroup" />
      ) : (
        <div className="overflow-x-auto">
          <table className="legacy-console-member-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">成员信息</th>
                <th className="px-4 py-3 text-left">权限</th>
              </tr>
            </thead>
            <tbody>
              {props.members.map(row => {
                const uid = Number(row.uid || 0);
                const value = (row.role as GroupMemberRole) || 'guest';
                const username = String(row.username || '-');
                const email = String(row.email || '');

                return (
                  <tr key={uid} className={`legacy-console-member-row-${String(row.role || 'guest')}`}>
                    <td className="px-4 py-4">
                      <div className="legacy-console-member-cell">
                        <Link to={`/user/profile/${uid}`}>
                          <Avatar src={`/api/user/avatar?uid=${uid}`} size={36} />
                        </Link>
                        <div className="legacy-console-member-meta">
                          <Link to={`/user/profile/${uid}`} className="legacy-console-member-name-link">
                            {username}
                          </Link>
                          {email ? <div className="legacy-console-member-email">{email}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {!props.canManageGroupMembers ? (
                        <span className="legacy-console-member-role-text">{roleLabel(value)}</span>
                      ) : (
                        <div className="legacy-console-member-actions flex flex-wrap items-center gap-3">
                          <Select
                            value={value}
                            onChange={role => {
                              if (role) {
                                props.onChangeMemberRole(uid, role as GroupMemberRole);
                              }
                            }}
                            disabled={value === 'owner'}
                            data={[
                              { value: 'owner', label: '组长', disabled: true },
                              { value: 'dev', label: '开发者' },
                              { value: 'guest', label: '访客' }
                            ]}
                            className="legacy-console-member-role-select"
                          />
                          {value !== 'owner' ? (
                            <Button
                              color="red"
                              variant="light"
                              size="xs"
                              onClick={() =>
                                modals.openConfirmModal({
                                  title: '确认删除该成员吗？',
                                  labels: { confirm: '确认', cancel: '取消' },
                                  confirmProps: { color: 'red' },
                                  onConfirm: () => props.onDeleteMember(uid)
                                })
                              }
                            >
                              移除
                            </Button>
                          ) : null}
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
