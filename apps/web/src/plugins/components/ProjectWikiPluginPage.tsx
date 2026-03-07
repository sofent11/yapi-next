import { useEffect, useState } from 'react';
import { Alert, Button, Card, Loader, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useParams } from 'react-router-dom';
import { getJson, postJson, toStringValue } from '../index';

type WikiDoc = {
  desc?: string;
  markdown?: string;
};

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function ProjectWikiPluginPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id || 0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdown, setMarkdown] = useState('');

  useEffect(() => {
    if (projectId <= 0) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<WikiDoc>(`/api/plugin/wiki_desc/get?project_id=${projectId}`);
        if (!active) return;
        if (res.errcode !== 0) {
          message.error(res.errmsg || '加载 Wiki 失败');
          return;
        }
        setMarkdown(toStringValue(res.data?.markdown || res.data?.desc || ''));
      } catch (error) {
        if (!active) return;
        message.error(`加载 Wiki 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  async function handleSave() {
    if (projectId <= 0) return;
    setSaving(true);
    try {
      const res = await postJson('/api/plugin/wiki_desc/up', {
        project_id: projectId,
        desc: markdown,
        markdown
      });
      if (res.errcode !== 0) {
        message.error(res.errmsg || 'Wiki 保存失败');
        return;
      }
      message.success('Wiki 已保存');
    } catch (error) {
      message.error(`Wiki 保存失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack className="workspace-stack">
      {loading ? (
        <div className="inline-flex items-center gap-2">
          <Loader size="sm" />
          <Text>加载 Wiki...</Text>
        </div>
      ) : null}
      <Alert color="blue" title="Markdown 编辑已切换为新实现（兼容保存旧版字段）。" />
      <Textarea
        minRows={18}
        value={markdown}
        onChange={event => setMarkdown(event.currentTarget.value)}
        placeholder="输入项目 Wiki（Markdown）"
      />
      <div>
        <Button loading={saving} onClick={() => void handleSave()}>
          保存 Wiki
        </Button>
      </div>
      <Card padding="lg" radius="lg" withBorder className="dark:!border-[#24456f] dark:!bg-[#10294d]">
        <Text fw={600} mb="sm">
          预览（纯文本）
        </Text>
        <pre className="plugin-pre">{markdown || '暂无内容'}</pre>
      </Card>
    </Stack>
  );
}
