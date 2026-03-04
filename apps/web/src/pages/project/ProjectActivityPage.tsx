import { LegacyTimeline } from '../../components/LegacyTimeline';

type ProjectActivityPageProps = {
  projectId: number;
};

export function ProjectActivityPage(props: ProjectActivityPageProps) {
  return (
    <div className="g-row">
      <section className="news-box m-panel">
        <LegacyTimeline
          type="project"
          typeid={props.projectId}
          projectIdForApiFilter={props.projectId}
          showApiFilter
        />
      </section>
    </div>
  );
}
