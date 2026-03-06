import { useState } from 'react';
import { PageHeader } from '../../components/layout';
import DataImportPanel from './components/DataImportPanel';
import DataExportPanel from './components/DataExportPanel';
import ImportTaskModal from './components/ImportTaskModal';
import type { ProjectDataPageProps } from './ProjectDataPage.types';

export function ProjectDataPage(props: ProjectDataPageProps) {
  const [taskId, setTaskId] = useState('');

  return (
    <div className="page-shell project-data-page">
      <PageHeader
        title="数据管理"
        subtitle="管理 OpenAPI/Swagger 导入导出流程，并跟踪导入任务执行状态。"
      />

      <div className="project-data-grid">
        <DataImportPanel projectId={props.projectId} token={props.token} onTaskStart={setTaskId} />
        <DataExportPanel projectId={props.projectId} token={props.token} />
      </div>

      <ImportTaskModal
        projectId={props.projectId}
        token={props.token}
        taskId={taskId}
        onClose={() => setTaskId('')}
      />
    </div>
  );
}
