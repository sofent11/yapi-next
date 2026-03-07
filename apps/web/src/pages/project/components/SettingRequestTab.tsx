import { useEffect } from 'react';
import { Button, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import RcForm, { Field, useForm as useRcForm } from 'rc-field-form';
import { useGetProjectQuery, useUpdateProjectMutation } from '../../../services/yapi-api';
import { ProjectSettingsActions } from '../../../domains/project/ProjectSettingsActions';
import { ProjectSettingsIntro } from '../../../domains/project/ProjectSettingsIntro';
import { ProjectSettingsPanel } from '../../../domains/project/ProjectSettingsPanel';
import type { RequestForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function SettingRequestTab(props: ProjectSettingPageProps) {
  const [requestForm] = useRcForm<RequestForm>();
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
    <ProjectSettingsPanel>
      <RcForm<RequestForm> form={requestForm}>
        <Stack>
          <ProjectSettingsIntro title="在请求发送前后执行全局脚本，适合统一注入 Header、鉴权或响应后处理。" />
          <Field<RequestForm> name="pre_script">
            {(control) => (
              <div>
                <Textarea
                  label="Pre-request Script（请求前处理脚本）"
                  minRows={10}
                  value={control.value ?? ''}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="在这里编写请求前处理脚本…"
                />
                <Text c="dimmed" size="sm" mt={6}>
                  发送请求前执行，适合补充签名、时间戳或环境变量。
                </Text>
              </div>
            )}
          </Field>
          <Field<RequestForm> name="after_script">
            {(control) => (
              <div>
                <Textarea
                  label="Post-response Script（响应后处理脚本）"
                  minRows={10}
                  value={control.value ?? ''}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="在这里编写响应后处理脚本…"
                />
                <Text c="dimmed" size="sm" mt={6}>
                  请求完成后执行，适合统一整理响应数据或埋点。
                </Text>
              </div>
            )}
          </Field>
          <ProjectSettingsActions>
            <Button className="btn-save" size="md" onClick={() => void handleSaveRequest()} loading={updateState.isLoading}>
              保存请求配置
            </Button>
          </ProjectSettingsActions>
        </Stack>
      </RcForm>
    </ProjectSettingsPanel>
  );
}
