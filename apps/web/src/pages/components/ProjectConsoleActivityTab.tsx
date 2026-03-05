import { LegacyTimeline } from '../../components/LegacyTimeline';
import { Typography } from 'antd';

const { Text } = Typography;

type ProjectConsoleActivityTabProps = {
  groupId: number;
};

export function ProjectConsoleActivityTab(props: ProjectConsoleActivityTabProps) {
  return (
    <div className="m-panel legacy-console-activity-panel">
      <div className="legacy-console-activity-head">
        <Text strong>分组动态</Text>
        <Text type="secondary">查看该分组内项目与接口的最新变更记录。</Text>
      </div>
      <LegacyTimeline type="group" typeid={props.groupId} />
    </div>
  );
}
