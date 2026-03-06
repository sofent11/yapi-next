import { Alert, Button, Input, Modal, Space, Typography, message } from 'antd';
import { useGetProjectQuery, useGetProjectTokenQuery, useUpdateProjectTokenMutation } from '../../../services/yapi-api';
import { SectionCard } from '../../../components/layout';
import type { ProjectSettingPageProps } from '../ProjectSettingPage.types';

const { Text } = Typography;

export function SettingTokenTab(props: ProjectSettingPageProps) {
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const tokenQuery = useGetProjectTokenQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [updateProjectToken, updateTokenState] = useUpdateProjectTokenMutation();

  const project = detailQuery.data?.data;
  const canDeleteProject = project?.role === 'owner' || project?.role === 'admin';

  function handleCopyToken() {
    const token = String(tokenQuery.data?.data || '');
    if (!token) {
      message.warning('token 为空');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(token);
      message.success('已经成功复制到剪切板');
      return;
    }
    const input = document.createElement('input');
    input.value = token;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    message.success('已经成功复制到剪切板');
  }

  function handleRegenerateToken() {
    Modal.confirm({
      title: '重新生成key',
      content: '重新生成之后，之前的key将无法使用，确认重新生成吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const response = await updateProjectToken({ projectId: props.projectId }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '更新 token 失败');
          return;
        }
        message.success('更新成功');
        await tokenQuery.refetch();
      }
    });
  }

  return (
    <SectionCard className="m-panel legacy-project-setting-card">
      <Space direction="vertical" className="legacy-workspace-stack">
        <Alert
          type="info"
          showIcon
          className="legacy-setting-info-alert"
          message="Token 用于 OpenAPI 与开放接口访问，请妥善保管并仅在可信环境中使用。"
        />
        <Text strong>工具标识</Text>
        <Text type="secondary">
          每个项目都有唯一 token，可用于请求项目 openapi。
        </Text>
        <Input value={String(tokenQuery.data?.data || '')} readOnly />
        <Space>
          <Button onClick={handleCopyToken}>复制 Token</Button>
          {canDeleteProject ? (
            <Button onClick={handleRegenerateToken} loading={updateTokenState.isLoading}>
              重新生成 Token
            </Button>
          ) : null}
          <Button onClick={() => tokenQuery.refetch()}>刷新</Button>
        </Space>
        <Text strong className="legacy-workspace-text-top">
          Open 接口
        </Text>
        <Text type="secondary">
          详细说明请查看 OpenAPI 文档，以下为常用接口：
        </Text>
        <ul className="legacy-open-api-list">
          <li>/api/open/run_auto_test</li>
          <li>/api/open/import_data</li>
          <li>/api/interface/add</li>
          <li>/api/interface/save</li>
          <li>/api/interface/up</li>
          <li>/api/interface/get</li>
          <li>/api/interface/list</li>
          <li>/api/interface/list_menu</li>
          <li>/api/interface/tree</li>
          <li>/api/interface/tree/node</li>
          <li>/api/interface/add_cat</li>
          <li>/api/interface/getCatMenu</li>
          <li>/api/spec/import</li>
          <li>/api/spec/import/task</li>
          <li>/api/spec/import/tasks</li>
          <li>/api/spec/import/task/download</li>
          <li>/api/spec/export</li>
        </ul>
      </Space>
    </SectionCard>
  );
}
