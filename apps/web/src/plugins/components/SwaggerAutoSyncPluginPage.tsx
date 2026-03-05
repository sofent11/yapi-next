import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
type AutoSyncForm = {
  is_sync_open: boolean;
  sync_mode: 'normal' | 'good' | 'merge';
  sync_json_url: string;
  sync_cron: string;
};

export function SwaggerAutoSyncPluginPage(props: { projectId: number }) {
  const [form] = Form.useForm<AutoSyncForm>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string>('');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<Record<string, unknown>>(
          `/api/plugin/autoSync/get?project_id=${props.projectId}`
        );
        if (res.errcode !== 0) {
          message.error(res.errmsg || '加载自动同步配置失败');
          return;
        }
        if (!active) return;
        const data = res.data || {};
        setRecordId(toStringValue(data._id));
        setLastSyncAt(Number(data.last_sync_time || 0));
        form.setFieldsValue({
          is_sync_open: data.is_sync_open === true,
          sync_mode: (toStringValue(data.sync_mode) as AutoSyncForm['sync_mode']) || 'normal',
          sync_json_url: toStringValue(data.sync_json_url),
          sync_cron: toStringValue(data.sync_cron) || '*/10 * * * *'
        });
      } catch (error) {
        if (!active) return;
        message.error(`加载自动同步配置失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [form, props.projectId]);

  async function handleSave() {
    const values = await form.validateFields();
    if (values.sync_cron.trim().split(/\s+/).length > 5) {
      message.error('暂不支持秒级 cron 表达式');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: props.projectId,
        id: recordId || undefined,
        is_sync_open: values.is_sync_open,
        sync_mode: values.sync_mode,
        sync_json_url: values.sync_json_url.trim(),
        sync_cron: values.sync_cron.trim()
      };
      const res = await postJson('/api/plugin/autoSync/save', payload);
      if (res.errcode !== 0) {
        message.error(res.errmsg || '保存自动同步配置失败');
        return;
      }
      const responseData = (res.data || {}) as Record<string, unknown>;
      const nextId = toStringValue(responseData._id);
      if (nextId) {
        setRecordId(nextId);
      } else if (!recordId) {
        // Keep id in sync for first-time create when backend returns write result object.
        await (async () => {
          try {
            const latest = await getJson<Record<string, unknown>>(
              `/api/plugin/autoSync/get?project_id=${props.projectId}`
            );
            if (latest.errcode === 0) {
              setRecordId(toStringValue((latest.data || {})._id));
            }
          } catch (_err) {
            // Ignore refresh failure, save already succeeded.
          }
        })();
      }
      message.success('自动同步配置已保存');
    } catch (error) {
      message.error(`保存自动同步配置失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载自动同步配置...</Text>
        </Space>
      ) : null}
      <Form<AutoSyncForm> layout="vertical" form={form}>
        <Form.Item label="是否开启自动同步" name="is_sync_open" valuePropName="checked">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
        {lastSyncAt > 0 ? (
          <Text type="secondary">上次同步时间：{new Date(lastSyncAt * 1000).toLocaleString()}</Text>
        ) : null}
        <Form.Item label="同步模式" name="sync_mode" rules={[{ required: true, message: '请选择同步模式' }]}>
          <Select
            options={[
              { label: '普通模式', value: 'normal' },
              { label: '智能合并', value: 'good' },
              { label: '完全覆盖', value: 'merge' }
            ]}
          />
        </Form.Item>
        <Form.Item
          label="Swagger/OpenAPI URL"
          name="sync_json_url"
          rules={[{ required: true, message: '请输入规范 URL' }]}
        >
          <Input placeholder="https://example.com/openapi.json" />
        </Form.Item>
        <Form.Item label="Cron 表达式" name="sync_cron" rules={[{ required: true, message: '请输入 cron 表达式' }]}>
          <Input placeholder="*/10 * * * *" />
        </Form.Item>
        <Button type="primary" onClick={() => void handleSave()} loading={saving}>
          保存
        </Button>
      </Form>
    </Space>
  );
}
