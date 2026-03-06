import { Link } from 'react-router-dom';
import { Avatar, Button, Popconfirm, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { GroupMemberListItem } from '@yapi-next/shared-types';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import type { GroupMemberRole } from '../../ProjectConsolePage.types';

const { Text } = Typography;

interface MemberListProps {
  groupMemberCountTitle: string;
  canManageGroupMembers: boolean;
  members: GroupMemberListItem[];
  loading: boolean;
  onOpenAddMember: () => void;
  onChangeMemberRole: (uid: number, role: GroupMemberRole) => void;
  onDeleteMember: (uid: number) => void;
}

export function MemberList(props: MemberListProps) {
  const ownerCount = props.members.filter(item => item.role === 'owner').length;
  const devCount = props.members.filter(item => item.role === 'dev').length;
  const guestCount = props.members.filter(item => item.role === 'guest').length;

  const columns: ColumnsType<GroupMemberListItem> = [
    {
      title: '成员信息',
      dataIndex: 'username',
      key: 'username',
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
              <Link to={`/user/profile/${uid}`} className="legacy-console-member-name-link">
                {username}
              </Link>
              {email ? <div className="legacy-console-member-email">{email}</div> : null}
            </div>
          </div>
        );
      }
    },
    {
      title: '权限',
      dataIndex: 'role',
      key: 'role',
      width: 220,
      render: (text: string, row) => {
        const value = (text as GroupMemberRole) || 'guest';
        if (!props.canManageGroupMembers) {
          return (
            <span className="legacy-console-member-role-text">
              {value === 'owner' ? '组长' : value === 'dev' ? '开发者' : '访客'}
            </span>
          );
        }
        return (
          <Space className="legacy-console-member-actions">
            <Select<GroupMemberRole>
              value={value}
              onChange={role => props.onChangeMemberRole(Number(row.uid), role)}
              disabled={value === 'owner'}
              options={[
                { value: 'owner', label: '组长', disabled: true },
                { value: 'dev', label: '开发者' },
                { value: 'guest', label: '访客' }
              ]}
              className="legacy-console-member-role-select"
            />
            {value !== 'owner' ? (
              <Popconfirm
                title="确认删除该成员吗？"
                onConfirm={() => props.onDeleteMember(Number(row.uid))}
                okText="确认"
                cancelText="取消"
              >
                <Button danger size="small">移除</Button>
              </Popconfirm>
            ) : null}
          </Space>
        );
      }
    }
  ];

  return (
    <div className="m-panel legacy-console-member-panel">
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
        ) : (
          <Tooltip title="您没有权限,请联系该分组组长或管理员">
            <Button type="primary" disabled>
              添加成员
            </Button>
          </Tooltip>
        )}
      </div>
      <Table
        className="legacy-console-member-table"
        columns={columns}
        dataSource={props.members}
        pagination={false}
        loading={props.loading}
        rowKey="uid"
        rowClassName={row => `legacy-console-member-row-${String(row.role || 'guest')}`}
        locale={{
          emptyText: <LegacyErrMsg type="noMemberInGroup" />
        }}
      />
    </div>
  );
}
