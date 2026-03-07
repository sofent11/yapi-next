import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import { PageHeader } from '../../components/layout';
import { InfoGrid, InfoGridItem } from '../../components/patterns/InfoGrid';
import { ProjectDataPanel } from '../../domains/project/ProjectDataPanel';
import DataImportPanel from './components/DataImportPanel';
import DataExportPanel from './components/DataExportPanel';
import ImportTaskModal from './components/ImportTaskModal';
import type { ProjectDataPageProps } from './ProjectDataPage.types';

export function ProjectDataPage(props: ProjectDataPageProps) {
  const [taskId, setTaskId] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  return (
    <div className="page-shell project-data-page">
      <PageHeader
        title="数据管理"
        subtitle="管理 OpenAPI/Swagger 导入导出流程，并跟踪导入任务执行状态。"
      />

      <ProjectDataPanel
        title="当前工作流"
        extra={
          taskId ? (
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
          ) : null
        }
      >
        <div className="project-data-flow-grid">
          {[
            ['1. 导入预检', '先执行规范预检，确认分类、接口数量和同步模式。'],
            ['2. 异步导入', '导入任务会在后台执行，你可以随时回到当前页继续跟踪。'],
            ['3. 规范导出', '完成导入或整理后，从当前项目导出 OpenAPI/Swagger 数据。']
          ].map(([title, body]) => (
            <div key={title} className="project-data-flow-card">
              <Text fw={700}>{title}</Text>
              <Text size="sm" c="dimmed" className="mt-2 leading-6">
                {body}
              </Text>
            </div>
          ))}
        </div>
        {taskId ? (
          <div className="project-data-task-banner">
            <Text fw={600}>正在跟踪导入任务</Text>
            <InfoGrid className="project-data-task-grid">
              <InfoGridItem label="任务 ID" value={taskId} />
              <InfoGridItem label="跟踪方式" value="后台持续跟踪，可随时重新打开查看" />
            </InfoGrid>
          </div>
        ) : null}
      </ProjectDataPanel>

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
