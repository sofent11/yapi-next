import { Text } from '@mantine/core';
import { LegacyTimeline } from '../../components/LegacyTimeline';

type ProjectConsoleActivityTabProps = {
  groupId: number;
};

export function ProjectConsoleActivityTab(props: ProjectConsoleActivityTabProps) {
  return (
    <div className="m-panel console-activity-panel">
      <div className="console-activity-head">
        <Text fw={700}>分组动态</Text>
        <Text c="dimmed">查看该分组内项目与接口的最新变更记录。</Text>
      </div>
      <LegacyTimeline type="group" typeid={props.groupId} />
    </div>
  );
}
