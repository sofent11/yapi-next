import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';
import { useParams } from 'react-router-dom';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
type WikiDoc = {
  desc?: string;
  markdown?: string;
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
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载 Wiki...</Text>
        </Space>
      ) : null}
      <Alert type="info" showIcon message="Markdown 编辑已切换为新实现（兼容保存旧版字段）。" />
      <Input.TextArea
        rows={18}
        value={markdown}
        onChange={event => setMarkdown(event.target.value)}
        placeholder="输入项目 Wiki（Markdown）"
      />
      <Space>
        <Button type="primary" loading={saving} onClick={() => void handleSave()}>
          保存 Wiki
        </Button>
      </Space>
      <Card size="small" title="预览（纯文本）">
        <pre className="legacy-plugin-pre">{markdown || '暂无内容'}</pre>
      </Card>
    </Space>
  );
}
