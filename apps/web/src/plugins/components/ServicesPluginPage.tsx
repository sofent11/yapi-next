import { useEffect, useState } from 'react';
import { Anchor, Code, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getJson, toStringValue } from '../index';
import { apiPath } from '../../utils/base-path';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

export function ServicesPluginPage(props: { projectId: number }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<{ token?: string }>(`${apiPath('project/token')}?id=${props.projectId}`);
        if (!active) return;
        if (res.errcode !== 0) {
          message.error(res.errmsg || '获取项目 token 失败');
          return;
        }
        const tokenValue =
          typeof res.data === 'string'
            ? res.data
            : toStringValue((res.data as Record<string, unknown> | undefined)?.token);
        setToken(String(tokenValue || '').trim());
      } catch (error) {
        if (!active) return;
        message.error(`获取项目 token 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [props.projectId]);

  const origin = window.location.origin;
  const modernUrl = `${origin}${apiPath(`open/plugin/export-full?type=json&pid=${props.projectId}&status=all&token=${token}`)}`;

  return (
    <Stack className="workspace-stack">
      {loading ? (
        <div className="inline-flex items-center gap-2">
          <Loader size="sm" />
          <Text>加载项目 token...</Text>
        </div>
      ) : null}
      <Title order={5}>生成 TS Services</Title>
      <Text>1. 安装工具：</Text>
      <Code block>npm i sm2tsservice -D</Code>
      <Text>2. 创建配置文件 `json2service.json`：</Text>
      <Code block>{`{
  "url": "yapi-swagger.json",
  "remoteUrl": "${modernUrl}",
  "type": "yapi",
  "swaggerParser": {}
}`}</Code>
      <Text>3. 生成代码：</Text>
      <Code block>npx sm2tsservice --clear</Code>
      <Anchor href="https://github.com/gogoyqj/sm2tsservice" target="_blank" rel="noopener noreferrer">
        查看 sm2tsservice 文档
      </Anchor>
    </Stack>
  );
}
