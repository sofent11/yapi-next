import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Modal, Progress } from 'antd';
import { useGetImportTaskQuery } from '../../../services/yapi-api';
import { taskStatusLabel } from '../ProjectDataPage.utils';

export interface ImportTaskModalProps {
  projectId: number;
  token?: string;
  taskId: string;
  onClose: () => void;
}

export default function ImportTaskModal({ projectId, token, taskId, onClose }: ImportTaskModalProps) {
  const { message: messageApi } = AntdApp.useApp();
  const [notifiedStatus, setNotifiedStatus] = useState('');

  useEffect(() => {
    setNotifiedStatus('');
  }, [taskId]);

  const taskQuery = useGetImportTaskQuery(
    {
      taskId,
      projectId,
      token,
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
  }, [notifiedStatus, taskQuery.data, messageApi]);

  const task = taskQuery.data?.data;
  const isTaskFinished = task?.status === 'success' || task?.status === 'failed';
  const taskProgressStatus = task?.status === 'failed' ? 'exception' : task?.status === 'success' ? 'success' : 'active';

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
    <Modal
      title="OpenAPI 导入任务"
      open={Boolean(taskId)}
      onCancel={onClose}
      footer={[
        <Button key="download" onClick={downloadTaskReport} disabled={!taskId}>下载结果</Button>,
        <Button key="close" type="primary" onClick={onClose}>{isTaskFinished ? '关闭' : '后台继续'}</Button>
      ]}
    >
      <p>任务 ID：{taskId || '-'}</p>
      <p>状态：{taskStatusLabel(task?.status)}</p>
      <Progress percent={Math.max(0, Math.min(100, Math.round(Number(task?.progress || 0))))} status={taskProgressStatus} />
      <p>阶段：{task?.stage || '-'}</p>
      <p>消息：{task?.message || '-'}</p>
    </Modal>
  );
}
