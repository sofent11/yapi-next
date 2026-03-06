import { ActivityTimeline } from '../../components/ActivityTimeline';

type ProjectActivityPageProps = {
  projectId: number;
};

export function ProjectActivityPage(props: ProjectActivityPageProps) {
  return (
    <div className="g-row">
      <section className="news-box m-panel">
        <ActivityTimeline
          type="project"
          typeid={props.projectId}
          projectIdForApiFilter={props.projectId}
          showApiFilter
        />
      </section>
    </div>
  );
}
