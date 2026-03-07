import { Text } from '@mantine/core';
import { ActivityTimeline } from '../../../components/ActivityTimeline';
import { DataToolbar } from '../../../components/patterns/DataToolbar';
import { SectionCard } from '../../../components/layout';

interface ActivityListProps {
  groupId: number;
}

export function ActivityList({ groupId }: ActivityListProps) {
  return (
    <SectionCard className="m-panel console-activity-panel">
      <DataToolbar
        title="分组动态"
        summary="查看该分组内项目与接口的最新变更记录。"
      />
      <ActivityTimeline type="group" typeid={groupId} />
    </SectionCard>
  );
}
