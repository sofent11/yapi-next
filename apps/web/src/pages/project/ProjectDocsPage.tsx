import { DocWorkspace } from '../../components/docs/DocWorkspace';

type ProjectDocsPageProps = {
  projectId: number;
};

export function ProjectDocsPage(props: ProjectDocsPageProps) {
  return (
    <div className="page-shell project-docs-page">
      <DocWorkspace
        title="项目文档"
        scope={{
          scope_type: 'project',
          project_id: props.projectId
        }}
      />
    </div>
  );
}
