import { Link } from 'react-router-dom';
import { Avatar, Button, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { LegacyErrMsg } from '../../components/LegacyErrMsg';

type GroupMemberRole = 'owner' | 'dev' | 'guest';
const { Text } = Typography;

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
      <div className="legacy-console-member-toolbar">
        <div className="legacy-console-member-toolbar-main">
          <Text strong>{props.groupMemberCountTitle}</Text>
          <Space size={8} className="legacy-console-member-summary" wrap>
            <span className="legacy-console-member-summary-chip">组长 {ownerCount}</span>
            <span className="legacy-console-member-summary-chip">开发者 {devCount}</span>
            <span className="legacy-console-member-summary-chip">访客 {guestCount}</span>
          </Space>
        </div>
        {props.canManageGroupMembers ? (
          <Button type="primary" onClick={props.onOpenAddMember}>
            添加成员
          </Button>
        ) : null}
      </div>
      <Table<GroupMemberRow>
        className="legacy-console-member-table"
        rowKey={item => Number(item.uid || 0)}
        loading={props.loading}
        dataSource={props.members}
        pagination={false}
        rowClassName={row => `legacy-console-member-row-${String(row.role || 'guest')}`}
        locale={{
          emptyText: <LegacyErrMsg type="noMemberInGroup" />
        }}
        columns={[
          {
            title: '成员信息',
            dataIndex: 'username',
            render: (_, row) => {
              const uid = Number(row.uid || 0);
              const username = String(row.username || '-');
              const email = String(row.email || '');
              return (
                <div className="legacy-console-member-cell">
                  <Link to={`/user/profile/${uid}`}>
                    <Avatar src={`/api/user/avatar?uid=${uid}`} size={36} />
                  </Link>
                  <div className="legacy-console-member-meta">
                    <Link to={`/user/profile/${uid}`} className="legacy-console-member-name-link">{username}</Link>
                    {email ? <div className="legacy-console-member-email">{email}</div> : null}
                  </div>
                </div>
              );
            }
          },
          {
            title: '权限',
            width: 220,
            render: (_, row) => {
              const uid = Number(row.uid || 0);
              const value = (row.role as GroupMemberRole) || 'dev';
              if (!props.canManageGroupMembers) return <span className="legacy-console-member-role-text">{roleLabel(value)}</span>;
              return (
                <Space className="legacy-console-member-actions">
                  <Select<GroupMemberRole>
                    value={value}
                    onChange={role => void props.onChangeMemberRole(uid, role)}
                    options={[
                      { value: 'owner', label: '组长' },
                      { value: 'dev', label: '开发者' },
                      { value: 'guest', label: '访客' }
                    ]}
                    className="legacy-console-member-role-select"
                  />
                  <Popconfirm title="确认删除该成员？" onConfirm={() => props.onDeleteMember(uid)}>
                    <Button danger size="small">移除</Button>
                  </Popconfirm>
                </Space>
              );
            }
          }
        ]}
      />
    </div>
  );
}
