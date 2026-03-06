import type { ReactNode } from 'react';
import { ActionIcon, Loader, Popover, Text, TextInput, Tooltip } from '@mantine/core';
import { IconFolderOpen, IconFolderPlus, IconSearch, IconUser, IconX } from '@tabler/icons-react';
import type { GroupListItem } from '@yapi-next/shared-types';
import { LegacyGuideActions } from '../../components/LegacyGuideActions';

type ProjectConsoleSidebarProps = {
  guideVisible: boolean;
  guideStep: number;
  personalSpaceTip: ReactNode;
  selectedGroupType?: string;
  selectedGroupName?: string;
  selectedGroupDesc?: string;
  groupKeyword: string;
  onGroupKeywordChange: (value: string) => void;
  loading: boolean;
  groups: GroupListItem[];
  selectedGroupId: number;
  onSelectGroup: (groupId: number) => void;
  onOpenCreateGroup: () => void;
  onGuideNext: () => void;
  onGuideExit: () => void;
};

function EmptyGroups() {
  return (
    <div className="console-group-empty rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      暂无分组
    </div>
  );
}

export function ProjectConsoleSidebar(props: ProjectConsoleSidebarProps) {
  return (
    <div className="m-group">
      {props.guideVisible && props.guideStep === 0 ? <div className="guide-focus-mask" /> : null}
      <div className="group-bar">
        <div className="curr-group">
          <div className="curr-group-name">
            <span className="name">
              {props.selectedGroupType === 'private' ? '个人空间' : props.selectedGroupName || '项目分组'}
            </span>
            <Tooltip label="添加分组">
              <ActionIcon
                variant="subtle"
                className="editSet console-group-add-button"
                onClick={props.onOpenCreateGroup}
                aria-label="添加分组"
              >
                <IconFolderPlus className="btn" size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
          <div className="curr-group-desc">简介: {props.selectedGroupDesc || ''}</div>
        </div>
        <div className="group-operate">
          <div className="search">
            <TextInput
              value={props.groupKeyword}
              onChange={event => props.onGroupKeywordChange(event.currentTarget.value)}
              placeholder="搜索分类"
              leftSection={<IconSearch size={16} />}
              rightSection={
                props.groupKeyword ? (
                  <ActionIcon
                    variant="subtle"
                    onClick={() => props.onGroupKeywordChange('')}
                    aria-label="清空搜索"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                ) : null
              }
            />
          </div>
        </div>
        <div className="console-group-summary">
          <Text c="dimmed">共 {props.groups.length} 个分组</Text>
        </div>
        {props.loading && props.groups.length === 0 ? <Loader className="console-group-loading" /> : null}
        {!props.loading && props.groups.length === 0 ? <EmptyGroups /> : null}
        <div className="group-list flex flex-col gap-2">
          {props.groups.map(group => {
            const gid = Number(group._id || 0);
            if (!Number.isFinite(gid) || gid <= 0) return null;
            const isPrivate = group.type === 'private';
            const labelNode = isPrivate ? '个人空间' : group.group_name;
            const button = (
              <button
                key={gid}
                type="button"
                className={`group-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
                  gid === props.selectedGroupId ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                }`}
                onClick={() => props.onSelectGroup(gid)}
              >
                {isPrivate ? <IconUser size={18} /> : <IconFolderOpen size={18} />}
                <span className="truncate">{labelNode}</span>
              </button>
            );

            if (isPrivate && gid === props.selectedGroupId && props.guideVisible && props.guideStep === 0) {
              return (
                <Popover key={gid} opened position="right" withinPortal={false}>
                  <Popover.Target>{button}</Popover.Target>
                  <Popover.Dropdown className="guide-popover">
                    {props.personalSpaceTip}
                    <LegacyGuideActions onNext={props.onGuideNext} onExit={props.onGuideExit} />
                  </Popover.Dropdown>
                </Popover>
              );
            }

            return button;
          })}
        </div>
      </div>
    </div>
  );
}
