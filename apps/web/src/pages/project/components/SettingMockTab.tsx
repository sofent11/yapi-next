import { useEffect } from 'react';
import { Button, Form, Input, Switch, message } from 'antd';
import { useGetProjectQuery, useUpdateProjectMutation } from '../../../services/yapi-api';
import { SectionCard } from '../../../components/layout';
import type { MockForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

export function SettingMockTab(props: ProjectSettingPageProps) {
  const [mockForm] = Form.useForm<MockForm>();
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [updateProject, updateState] = useUpdateProjectMutation();

  useEffect(() => {
    const data = detailQuery.data?.data;
    if (!data) return;
    const meta = data as unknown as Record<string, unknown>;
    mockForm.setFieldsValue({
      is_mock_open: Boolean(meta.is_mock_open),
      project_mock_script: String(meta.project_mock_script || '')
    });
  }, [detailQuery.data, mockForm]);

  async function handleSaveMock() {
    const values = await mockForm.validateFields();
    const response = await updateProject({
      id: props.projectId,
      is_mock_open: Boolean(values.is_mock_open),
      project_mock_script: values.project_mock_script || ''
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存 mock 脚本失败');
      return;
    }
    message.success('全局 mock 配置已更新');
    await detailQuery.refetch();
  }

  return (
    <SectionCard className="m-panel legacy-project-setting-card">
      <Form<MockForm> form={mockForm} layout="vertical">
        <Form.Item label="是否开启" name="is_mock_open" valuePropName="checked">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
        <Form.Item label="Mock脚本" name="project_mock_script">
          <Input.TextArea rows={16} />
        </Form.Item>
        <div className="legacy-setting-actions">
          <Button className="btn-save" type="primary" size="large" onClick={() => void handleSaveMock()} loading={updateState.isLoading}>
            保 存
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
