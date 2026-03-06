import { useEffect } from 'react';
import { Alert, Button, Form, Input, message } from 'antd';
import { useGetProjectQuery, useUpdateProjectMutation } from '../../../services/yapi-api';
import { SectionCard } from '../../../components/layout';
import type { RequestForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

export function SettingRequestTab(props: ProjectSettingPageProps) {
  const [requestForm] = Form.useForm<RequestForm>();
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [updateProject, updateState] = useUpdateProjectMutation();

  useEffect(() => {
    const data = detailQuery.data?.data;
    if (!data) return;
    const meta = data as unknown as Record<string, unknown>;
    requestForm.setFieldsValue({
      pre_script: String(meta.pre_script || ''),
      after_script: String(meta.after_script || '')
    });
  }, [detailQuery.data, requestForm]);

  async function handleSaveRequest() {
    const values = await requestForm.validateFields();
    const response = await updateProject({
      id: props.projectId,
      pre_script: values.pre_script || '',
      after_script: values.after_script || ''
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存请求配置失败');
      return;
    }
    message.success('请求配置已更新');
    await detailQuery.refetch();
  }

  return (
    <SectionCard className="m-panel legacy-project-setting-card">
      <Form<RequestForm> form={requestForm} layout="vertical">
        <Alert
          showIcon
          type="info"
          className="legacy-setting-info-alert"
          message="在请求发送前后执行全局脚本，适合统一注入 Header、鉴权或响应后处理。"
        />
        <Form.Item
          label="Pre-request Script（请求前处理脚本）"
          name="pre_script"
          extra="发送请求前执行，适合补充签名、时间戳或环境变量。"
        >
          <Input.TextArea rows={10} placeholder="在这里编写请求前处理脚本…" />
        </Form.Item>
        <Form.Item
          label="Post-response Script（响应后处理脚本）"
          name="after_script"
          extra="请求完成后执行，适合统一整理响应数据或埋点。"
        >
          <Input.TextArea rows={10} placeholder="在这里编写响应后处理脚本…" />
        </Form.Item>
        <div className="legacy-setting-actions">
          <Button className="btn-save" type="primary" size="large" onClick={() => void handleSaveRequest()} loading={updateState.isLoading}>
            保存请求配置
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
