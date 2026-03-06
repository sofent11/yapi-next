import { useEffect } from 'react';
import { Button, Form, Input, message } from 'antd';
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
        <Form.Item label="Pre-request Script(请求参数处理脚本)" name="pre_script">
          <Input.TextArea rows={10} />
        </Form.Item>
        <Form.Item label="Pre-response Script(响应数据处理脚本)" name="after_script">
          <Input.TextArea rows={10} />
        </Form.Item>
        <div className="legacy-setting-actions">
          <Button className="btn-save" type="primary" size="large" onClick={() => void handleSaveRequest()} loading={updateState.isLoading}>
            保 存
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
