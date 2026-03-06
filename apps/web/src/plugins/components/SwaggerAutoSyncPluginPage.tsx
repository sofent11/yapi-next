import { useEffect, useState } from 'react';
import { Button, Loader, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import RcForm, { Field, useForm as useRcForm } from 'rc-field-form';
import { postJson, getJson, toStringValue } from '../index';

type AutoSyncForm = {
  is_sync_open: boolean;
  sync_mode: 'normal' | 'good' | 'merge';
  sync_json_url: string;
  sync_cron: string;
};

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function SwaggerAutoSyncPluginPage(props: { projectId: number }) {
  const [form] = useRcForm<AutoSyncForm>();
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
    <Stack className="workspace-stack">
      {loading ? (
        <div className="inline-flex items-center gap-2">
          <Loader size="sm" />
          <Text>加载自动同步配置...</Text>
        </div>
      ) : null}
      <RcForm<AutoSyncForm> form={form}>
        <Stack>
          <Field<AutoSyncForm> name="is_sync_open" valuePropName="checked">
            {(control) => (
              <Switch
                label="是否开启自动同步"
                checked={Boolean(control.value)}
                onChange={event => control.onChange(event.currentTarget.checked)}
              />
            )}
          </Field>
          {lastSyncAt > 0 ? (
            <Text c="dimmed">上次同步时间：{new Date(lastSyncAt * 1000).toLocaleString()}</Text>
          ) : null}
          <Field<AutoSyncForm> name="sync_mode" rules={[{ required: true, message: '请选择同步模式' }]}>
            {(control, meta) => (
              <Select
                label="同步模式"
                value={control.value}
                onChange={value => control.onChange(value || 'normal')}
                data={[
                  { label: '普通模式', value: 'normal' },
                  { label: '智能合并', value: 'good' },
                  { label: '完全覆盖', value: 'merge' }
                ]}
                error={meta.errors[0]}
              />
            )}
          </Field>
          <Field<AutoSyncForm> name="sync_json_url" rules={[{ required: true, message: '请输入规范 URL' }]}>
            {(control, meta) => (
              <TextInput
                label="Swagger/OpenAPI URL"
                value={control.value}
                onChange={event => control.onChange(event.currentTarget.value)}
                placeholder="https://example.com/openapi.json"
                error={meta.errors[0]}
              />
            )}
          </Field>
          <Field<AutoSyncForm> name="sync_cron" rules={[{ required: true, message: '请输入 cron 表达式' }]}>
            {(control, meta) => (
              <TextInput
                label="Cron 表达式"
                value={control.value}
                onChange={event => control.onChange(event.currentTarget.value)}
                placeholder="*/10 * * * *"
                error={meta.errors[0]}
              />
            )}
          </Field>
          <div>
            <Button loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </div>
        </Stack>
      </RcForm>
    </Stack>
  );
}
