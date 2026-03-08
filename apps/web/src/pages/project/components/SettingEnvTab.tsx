import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useGetProjectEnvQuery, useUpdateProjectEnvMutation, useGetProjectQuery } from '../../../services/yapi-api';
import { ProjectSettingsActions } from '../../../domains/project/ProjectSettingsActions';
import { ProjectSettingsEditorCard } from '../../../domains/project/ProjectSettingsEditorCard';
import { ProjectSettingsIntro } from '../../../domains/project/ProjectSettingsIntro';
import { ProjectSettingsPanel } from '../../../domains/project/ProjectSettingsPanel';
import { parseJsonArray, toJsonText } from '../ProjectSettingPage.utils';
import type { EnvEditorItem, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function SettingEnvTab(props: ProjectSettingPageProps) {
  const envQuery = useGetProjectEnvQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [updateProjectEnv, updateEnvState] = useUpdateProjectEnvMutation();
  const [envEditors, setEnvEditors] = useState<EnvEditorItem[]>([]);

  useEffect(() => {
    const envList = envQuery.data?.data?.env || [];
    const mapped = envList.map((item, index) => ({
      key: `${index}-${Date.now()}`,
      name: String(item.name || ''),
      domain: String(item.domain || ''),
      headerText: toJsonText(item.header || []),
      globalText: toJsonText(item.global || [])
    }));
    setEnvEditors(mapped);
  }, [envQuery.data]);

  async function handleSaveEnv() {
    if (envEditors.some(item => !item.name.trim())) {
      message.error('环境名称不能为空');
      return;
    }
    let env: Array<{ name: string; domain: string; header: Array<Record<string, unknown>>; global: Array<Record<string, unknown>> }>;
    try {
      env = envEditors.map(item => ({
        name: item.name.trim(),
        domain: item.domain.trim(),
        header: parseJsonArray(item.headerText, `环境 ${item.name || '-'} 的 header`),
        global: parseJsonArray(item.globalText, `环境 ${item.name || '-'} 的 global`)
      }));
    } catch (err) {
      message.error((err as Error).message || '环境配置 JSON 格式错误');
      return;
    }
    const response = await updateProjectEnv({
      id: props.projectId,
      env
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存环境配置失败');
      return;
    }
    message.success('环境配置已更新');
    await Promise.all([envQuery.refetch(), detailQuery.refetch()]);
  }

  return (
    <ProjectSettingsPanel>
      <Stack className="workspace-stack">
        <ProjectSettingsIntro title="维护不同环境的域名、Header 和全局变量。" />
        <div className="project-settings-toolbar">
          <Button
            variant="default"
            onClick={() =>
              setEnvEditors(prev => [
                ...prev,
                {
                  key: `${Date.now()}-${prev.length}`,
                  name: '新环境',
                  domain: '',
                  headerText: '[]',
                  globalText: '[]'
                }
              ])
            }
          >
            添加环境
          </Button>
          <Button onClick={() => void handleSaveEnv()} loading={updateEnvState.isLoading}>
            保存环境
          </Button>
        </div>
        {envEditors.length === 0 ? (
          <Alert color="blue" className="project-settings-empty-alert" title="还没有环境，先添加一个。" />
        ) : null}
        {envEditors.map((item, index) => (
          <ProjectSettingsEditorCard
            key={item.key}
            title={`环境 ${index + 1}`}
            actions={
              <Button
                color="red"
                variant="light"
                onClick={() => setEnvEditors(prev => prev.filter((_, i) => i !== index))}
              >
                删除
              </Button>
            }
          >
            <Stack className="workspace-stack">
              <TextInput
                value={item.name}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) => (i === index ? { ...env, name: event.currentTarget.value } : env))
                  )
                }
                placeholder="例如：开发环境…"
              />
              <TextInput
                value={item.domain}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) => (i === index ? { ...env, domain: event.currentTarget.value } : env))
                  )
                }
                placeholder="例如：https://dev.example.com…"
              />
              <Text c="dimmed">Header(JSON 数组)</Text>
              <Textarea
                minRows={4}
                value={item.headerText}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) =>
                      i === index ? { ...env, headerText: event.currentTarget.value } : env
                    )
                  )
                }
              />
              <Text c="dimmed">Global(JSON 数组)</Text>
              <Textarea
                minRows={4}
                value={item.globalText}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) =>
                      i === index ? { ...env, globalText: event.currentTarget.value } : env
                    )
                  )
                }
              />
            </Stack>
          </ProjectSettingsEditorCard>
        ))}
        {envEditors.length > 0 ? (
          <ProjectSettingsActions>
            <Button onClick={() => void handleSaveEnv()} loading={updateEnvState.isLoading}>
              保存环境
            </Button>
          </ProjectSettingsActions>
        ) : null}
      </Stack>
    </ProjectSettingsPanel>
  );
}
