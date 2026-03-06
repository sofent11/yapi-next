import { useEffect, useState } from 'react';
import { Button, Modal, Progress, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useGetImportTaskQuery } from '../../../services/yapi-api';
import { taskStatusLabel } from '../ProjectDataPage.utils';

export interface ImportTaskModalProps {
  projectId: number;
  token?: string;
  taskId: string;
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

export default function ImportTaskModal({ projectId, token, taskId, onClose }: ImportTaskModalProps) {
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
    <Modal title="OpenAPI 导入任务" opened={Boolean(taskId)} onClose={onClose}>
      <Stack>
        <Text>任务 ID：{taskId || '-'}</Text>
        <Text>状态：{taskStatusLabel(task?.status)}</Text>
        <Progress value={Math.max(0, Math.min(100, Math.round(Number(task?.progress || 0))))} color={progressColor} />
        <Text>阶段：{task?.stage || '-'}</Text>
        <Text>消息：{task?.message || '-'}</Text>
        <div className="flex justify-end gap-3">
          <Button variant="default" onClick={downloadTaskReport} disabled={!taskId}>
            下载结果
          </Button>
          <Button onClick={onClose}>{isTaskFinished ? '关闭' : '后台继续'}</Button>
        </div>
      </Stack>
    </Modal>
  );
}
