import { useEffect, useState } from 'react';
import { Alert, Button, Code, Loader, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getJson, postJson, toStringValue } from '../index';

type SyncResult = {
  detectedFormat?: string;
  categories?: number;
  interfaces?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ path?: string; method?: string; message?: string }>;
};

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  warning(text: string) {
    notifications.show({ color: 'yellow', message: text });
  }
};

export function PluginTestPage(props: { projectId: number }) {
  const [specUrl, setSpecUrl] = useState('');
  const [projectToken, setProjectToken] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProjectToken() {
      setLoadingToken(true);
      try {
        const res = await getJson<string>(`/api/project/token?project_id=${props.projectId}`);
        if (!active) return;
        if (res.errcode === 0) {
          setProjectToken(toStringValue(res.data));
          return;
        }
        setProjectToken('');
      } catch (_error) {
        if (!active) return;
        setProjectToken('');
      } finally {
        if (active) setLoadingToken(false);
      }
    }
    void loadProjectToken();
    return () => {
      active = false;
    };
  }, [props.projectId]);

  async function handleSync() {
    const targetUrl = specUrl.trim();
    if (!targetUrl) {
      message.warning('请输入 OpenAPI 3.0 URL');
      return;
    }
    setSyncing(true);
    try {
      const res = await postJson<SyncResult>('/api/spec/import', {
        project_id: props.projectId,
        token: projectToken || undefined,
        source: 'url',
        format: 'openapi3',
        syncMode: 'sync',
        url: targetUrl
      });
      if (res.errcode !== 0) {
        message.error(res.errmsg || 'Swagger 3.0 同步失败');
        return;
      }
      setResult(res.data || {});
      message.success('Swagger 3.0 同步完成');
    } catch (error) {
      message.error(`Swagger 3.0 同步失败: ${String((error as Error).message || error)}`);
    } finally {
      setSyncing(false);
    }
  }

  const errors = Array.isArray(result?.errors) ? result?.errors : [];

  return (
    <Stack className="workspace-stack">
      <Alert color="blue" title="同步规则">
        <div className="space-y-1 text-sm">
          <div>缺失分类按 OpenAPI tags 创建。</div>
          <div>缺失接口按 OpenAPI 定义创建。</div>
          <div>已存在接口保持原分类不变。</div>
          <div>已存在字段保留原名称与注释，只按 OpenAPI 增加新字段、删除已移除字段。</div>
        </div>
      </Alert>

      {loadingToken ? (
        <div className="inline-flex items-center gap-2">
          <Loader size="sm" />
          <Text>正在加载项目 Token...</Text>
        </div>
      ) : null}

      <TextInput
        label="OpenAPI 3.0 URL"
        placeholder="https://example.com/openapi.json"
        value={specUrl}
        onChange={event => setSpecUrl(event.currentTarget.value)}
      />

      <div className="flex flex-wrap gap-3">
        <Button loading={syncing} onClick={() => void handleSync()}>
          开始同步
        </Button>
      </div>

      {result ? (
        <Alert color="teal" title="同步结果">
          <div className="space-y-1 text-sm">
            <div>{`文档格式：${result.detectedFormat || 'openapi3'}`}</div>
            <div>{`分类：${Number(result.categories || 0)}，接口：${Number(result.interfaces || 0)}`}</div>
            <div>{`新增：${Number(result.created || 0)}，更新：${Number(result.updated || 0)}，跳过：${Number(result.skipped || 0)}，失败：${Number(result.failed || 0)}`}</div>
            {errors.length > 0 ? (
              <div className="space-y-1 pt-2">
                {errors.slice(0, 5).map((item, index) => (
                  <Code key={`${item.method || 'method'}-${item.path || 'path'}-${index}`} block>
                    {`${item.method || 'UNKNOWN'} ${item.path || '-'}: ${item.message || '同步失败'}`}
                  </Code>
                ))}
              </div>
            ) : null}
          </div>
        </Alert>
      ) : null}
    </Stack>
  );
}
