import { useState } from 'react';
import { Button } from '@mantine/core';
import DataImportPanel from './components/DataImportPanel';
import DataExportPanel from './components/DataExportPanel';
import ImportTaskModal from './components/ImportTaskModal';
import type { ProjectDataPageProps } from './ProjectDataPage.types';

export function ProjectDataPage(props: ProjectDataPageProps) {
  const [taskId, setTaskId] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  return (
    <div className="page-shell project-data-page">
      {taskId ? (
        <div className="project-data-task-toolbar">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">正在跟踪导入任务</p>
            <p className="text-sm text-slate-500">任务 ID：{taskId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="default" onClick={() => setTaskModalOpen(true)}>
              查看导入任务
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                setTaskModalOpen(false);
                setTaskId('');
              }}
            >
              停止跟踪
            </Button>
          </div>
        </div>
      ) : null}

      <div className="project-data-grid">
        <DataImportPanel
          projectId={props.projectId}
          token={props.token}
          onTaskStart={nextTaskId => {
            setTaskId(nextTaskId);
            setTaskModalOpen(true);
          }}
        />
        <DataExportPanel projectId={props.projectId} token={props.token} />
      </div>

      <ImportTaskModal
        projectId={props.projectId}
        token={props.token}
        taskId={taskId}
        opened={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
      />
    </div>
  );
}
