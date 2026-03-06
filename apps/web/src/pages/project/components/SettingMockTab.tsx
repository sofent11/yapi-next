import { useEffect } from 'react';
import { Alert, Button, Stack, Switch, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import RcForm, { Field, useForm as useRcForm } from 'rc-field-form';
import { useGetProjectQuery, useUpdateProjectMutation } from '../../../services/yapi-api';
import { SectionCard } from '../../../components/layout';
import type { MockForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function SettingMockTab(props: ProjectSettingPageProps) {
  const [mockForm] = useRcForm<MockForm>();
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
      <RcForm<MockForm> form={mockForm}>
        <Stack>
          <Alert
            color="blue"
            className="legacy-setting-info-alert"
            title="为整个项目统一定义 Mock 入口与全局脚本，适合需要稳定演示数据或联调兜底的场景。"
          />
          <Field<MockForm> name="is_mock_open" valuePropName="checked">
            {(control) => (
              <Switch
                label="是否开启全局 Mock"
                checked={Boolean(control.value)}
                onChange={event => control.onChange(event.currentTarget.checked)}
              />
            )}
          </Field>
          <Field<MockForm> name="project_mock_script">
            {(control) => (
              <div>
                <Textarea
                  label="Mock 脚本"
                  minRows={16}
                  value={control.value ?? ''}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="在这里编写项目级 Mock 脚本…"
                />
                <Text c="dimmed" size="sm" mt={6}>
                  脚本会作用于项目所有接口返回值，请保持逻辑简洁且可维护。
                </Text>
              </div>
            )}
          </Field>
          <div className="legacy-setting-actions">
            <Button className="btn-save" size="md" onClick={() => void handleSaveMock()} loading={updateState.isLoading}>
              保存 Mock 配置
            </Button>
          </div>
        </Stack>
      </RcForm>
    </SectionCard>
  );
}
