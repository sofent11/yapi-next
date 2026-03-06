import { Text } from '@mantine/core';
import { LegacyTimeline } from '../../../components/LegacyTimeline';

interface ActivityListProps {
  groupId: number;
}

export function ActivityList({ groupId }: ActivityListProps) {
  return (
    <div className="m-panel legacy-console-activity-panel">
      <div className="legacy-console-activity-head">
        <Text fw={700}>分组动态</Text>
        <Text c="dimmed">查看该分组内项目与接口的最新变更记录。</Text>
      </div>
      <LegacyTimeline type="group" typeid={groupId} />
    </div>
  );
}
