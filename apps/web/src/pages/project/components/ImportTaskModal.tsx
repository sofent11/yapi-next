import { useEffect, useState } from 'react';
import { Button, Modal, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';
import { useGetImportTaskQuery } from '../../../services/yapi-api';
import { taskStatusLabel } from '../ProjectDataPage.utils';

export interface ImportTaskModalProps {
  projectId: number;
  token?: string;
  taskId: string;
  opened: boolean;
  onClose: () => void;
}

const messageApi = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

export default function ImportTaskModal({ projectId, token, taskId, opened, onClose }: ImportTaskModalProps) {
  const [notifiedStatus, setNotifiedStatus] = useState('');

  useEffect(() => {
    setNotifiedStatus('');
  }, [taskId]);

  const taskQuery = useGetImportTaskQuery(
    {
      taskId,
      projectId,
      token
    },
    {
      skip: !taskId,
      pollingInterval: taskId ? 1200 : 0
    }
  );

  useEffect(() => {
    const task = taskQuery.data?.data;
    if (!task) return;
    if (task.status !== 'success' && task.status !== 'failed') return;
    if (notifiedStatus === task.status) return;

    if (task.status === 'success') {
      messageApi.success(task.message || '导入任务执行成功');
    } else {
      messageApi.error(task.message || '导入任务执行失败');
    }
    setNotifiedStatus(task.status);
  }, [notifiedStatus, taskQuery.data]);

  const task = taskQuery.data?.data;
  const isTaskFinished = task?.status === 'success' || task?.status === 'failed';
  const progressColor = task?.status === 'failed' ? 'red' : task?.status === 'success' ? 'teal' : 'blue';
  const progressValue = Math.max(0, Math.min(100, Math.round(Number(task?.progress || 0))));

  function downloadTaskReport() {
    if (!taskId) return;
    const link = document.createElement('a');
    link.href = `/api/spec/import/task/download?task_id=${encodeURIComponent(taskId)}`;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <Modal title="OpenAPI 导入任务" opened={opened && Boolean(taskId)} onClose={onClose}>
      <Stack className="project-data-task-modal">
        <InfoGrid>
          <InfoGridItem label="任务 ID" value={taskId || '-'} span />
          <InfoGridItem label="状态" value={taskStatusLabel(task?.status)} />
          <InfoGridItem label="阶段" value={task?.stage || '-'} />
          <InfoGridItem label="进度" value={`${progressValue}%`} />
          <InfoGridItem label="消息" value={task?.message || '-'} span />
        </InfoGrid>
        <div className="project-data-result-card">
          <Text fw={600}>执行进度</Text>
          <Progress value={progressValue} color={progressColor} />
          <Text size="sm" c="dimmed" className="workspace-paragraph-compact">
            任务进行中时会自动轮询刷新，你可以关闭弹窗后稍后回来继续查看。
          </Text>
        </div>
        <div className="project-data-actions">
          <Button variant="default" onClick={downloadTaskReport} disabled={!taskId}>
            下载结果
          </Button>
          <Button onClick={onClose}>{isTaskFinished ? '关闭' : '后台继续'}</Button>
        </div>
      </Stack>
    </Modal>
  );
}
