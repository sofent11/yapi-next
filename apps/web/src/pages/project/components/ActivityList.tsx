import { ActivityTimeline } from '../../../components/ActivityTimeline';
import { SectionCard } from '../../../components/layout';

interface ActivityListProps {
  groupId: number;
}

export function ActivityList({ groupId }: ActivityListProps) {
  return (
    <SectionCard className="m-panel console-activity-panel">
      <ActivityTimeline type="group" typeid={groupId} />
    </SectionCard>
  );
}
