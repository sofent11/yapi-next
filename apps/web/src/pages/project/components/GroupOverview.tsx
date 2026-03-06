import type { ReactNode } from 'react';
import { FolderOpenOutlined, FolderAddOutlined, UserOutlined } from '@ant-design/icons';
import { Empty, Input, Menu, Popover, Spin, Tooltip, Typography } from 'antd';
import type { GroupListItem } from '@yapi-next/shared-types';
import { LegacyGuideActions } from '../../../components/LegacyGuideActions';

const { Text } = Typography;

interface GroupOverviewProps {
  guideVisible: boolean;
  guideStep: number;
  personalSpaceTip: ReactNode;
  selectedGroupType?: string;
  selectedGroupName?: string;
  selectedGroupDesc?: string;
  selectedGroupRole?: string;
  projectCount: number;
  groupKeyword: string;
  onGroupKeywordChange: (value: string) => void;
  loading: boolean;
  groups: GroupListItem[];
  selectedGroupId: number;
  onSelectGroup: (groupId: number) => void;
  onOpenCreateGroup: () => void;
  onGuideNext: () => void;
  onGuideExit: () => void;
}

export function GroupOverview(props: GroupOverviewProps) {
  const menuItems = props.groups
    .map(group => {
      const gid = Number(group._id || 0);
      if (!Number.isFinite(gid) || gid <= 0) return null;
      const isPrivate = group.type === 'private';
      const labelNode = isPrivate ? '个人空间' : group.group_name;
      return {
        key: String(gid),
        className: 'group-item',
        icon: isPrivate ? <UserOutlined /> : <FolderOpenOutlined />,
        label:
          isPrivate && gid === props.selectedGroupId && props.guideVisible && props.guideStep === 0 ? (
            <Popover
              placement="right"
              open
              title={props.personalSpaceTip}
              content={<LegacyGuideActions onNext={props.onGuideNext} onExit={props.onGuideExit} />}
              overlayClassName="legacy-guide-popover"
            >
              <span>{labelNode}</span>
            </Popover>
          ) : (
            labelNode
          ),
        onClick: () => props.onSelectGroup(gid)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="m-group">
      {props.guideVisible && props.guideStep === 0 ? <div className="legacy-study-mask" /> : null}
        <div className="group-bar">
        <div className="curr-group">
          <div className="curr-group-name">
            <span className="name">
              {props.selectedGroupType === 'private' ? '个人空间' : props.selectedGroupName || '项目分组'}
            </span>
            <Tooltip title="添加分组">
              <button
                type="button"
                className="editSet legacy-console-add-group-btn"
                onClick={props.onOpenCreateGroup}
                aria-label="新建分组"
              >
                <FolderAddOutlined className="btn" />
              </button>
            </Tooltip>
          </div>
          <div className="curr-group-desc">{props.selectedGroupDesc || '当前分组尚未填写简介。'}</div>
          <div className="legacy-console-group-badges">
            {props.selectedGroupRole ? <Text className="legacy-console-group-badge">{`角色 ${props.selectedGroupRole}`}</Text> : null}
            <Text className="legacy-console-group-badge">{`${props.projectCount} 个项目`}</Text>
          </div>
        </div>
        <div className="group-operate">
          <div className="search">
            <Input.Search
              value={props.groupKeyword}
              onChange={event => props.onGroupKeywordChange(event.target.value)}
              placeholder="搜索分组…"
              aria-label="搜索分组"
              allowClear
            />
          </div>
        </div>
        <div className="legacy-console-group-summary">
          <Text type="secondary">共 {props.groups.length} 个分组</Text>
        </div>
        {props.loading && props.groups.length === 0 ? (
          <Spin className="legacy-console-group-loading" />
        ) : null}
        {!props.loading && props.groups.length === 0 ? (
          <div className="legacy-console-group-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无分组"
            />
          </div>
        ) : null}
        <Menu
          className="group-list"
          mode="inline"
          selectedKeys={[String(props.selectedGroupId)]}
          items={menuItems}
        />
      </div>
    </div>
  );
}
