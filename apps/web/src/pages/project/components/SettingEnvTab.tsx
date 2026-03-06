import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography, message } from 'antd';
import { useGetProjectEnvQuery, useUpdateProjectEnvMutation, useGetProjectQuery } from '../../../services/yapi-api';
import { SectionCard } from '../../../components/layout';
import { parseJsonArray, toJsonText } from '../ProjectSettingPage.utils';
import type { EnvEditorItem, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const { Text } = Typography;

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
    <SectionCard className="m-panel legacy-project-setting-card">
      <Space direction="vertical" className="legacy-workspace-stack">
        <Space>
          <Button
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
          <Button
            type="primary"
            onClick={() => void handleSaveEnv()}
            loading={updateEnvState.isLoading}
          >
            保存环境
          </Button>
        </Space>
        {envEditors.length === 0 ? <Alert type="info" showIcon message="暂无环境，点击“添加环境”开始配置。" /> : null}
        {envEditors.map((item, index) => (
          <Card
            key={item.key}
            title={`环境 ${index + 1}`}
            extra={
              <Button
                danger
                onClick={() => setEnvEditors(prev => prev.filter((_, i) => i !== index))}
              >
                删除
              </Button>
            }
          >
            <Space direction="vertical" className="legacy-workspace-stack">
              <Input
                value={item.name}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) => (i === index ? { ...env, name: event.target.value } : env))
                  )
                }
                placeholder="环境名称"
              />
              <Input
                value={item.domain}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) => (i === index ? { ...env, domain: event.target.value } : env))
                  )
                }
                placeholder="环境域名"
              />
              <Text type="secondary">Header(JSON 数组)</Text>
              <Input.TextArea
                rows={4}
                value={item.headerText}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) =>
                      i === index ? { ...env, headerText: event.target.value } : env
                    )
                  )
                }
              />
              <Text type="secondary">Global(JSON 数组)</Text>
              <Input.TextArea
                rows={4}
                value={item.globalText}
                onChange={event =>
                  setEnvEditors(prev =>
                    prev.map((env, i) =>
                      i === index ? { ...env, globalText: event.target.value } : env
                    )
                  )
                }
              />
            </Space>
          </Card>
        ))}
      </Space>
    </SectionCard>
  );
}
