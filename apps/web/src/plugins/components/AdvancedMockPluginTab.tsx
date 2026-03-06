import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Loader,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Tabs
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import RcForm, { Field, List, useForm as useRcForm, useWatch } from 'rc-field-form';
import json5 from 'json5';
import { getJson, parseJsonSafe, parseMaybeJson, postJson, toStringValue } from '../index';

type AdvancedMockCaseRecord = {
  _id?: string | number;
  name?: string;
  ip?: string;
  ip_enable?: boolean;
  username?: string;
  up_time?: number;
  case_enable?: boolean;
  code?: number;
  delay?: number;
  headers?: Array<{ name?: string; value?: string }>;
  params?: Record<string, unknown>;
  res_body?: string;
};

type AdvancedMockKeyValue = {
  name: string;
  value: string;
};

type AdvancedMockCaseForm = {
  name: string;
  ip_enable: boolean;
  ip: string;
  params_mode: 'form' | 'json';
  params_rows: AdvancedMockKeyValue[];
  params_json: string;
  code: number;
  delay: number;
  headers: AdvancedMockKeyValue[];
  res_body: string;
};

const ADV_MOCK_HTTP_CODES = [
  100, 101, 102, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 307, 308, 400,
  401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 422, 423, 424, 426,
  428, 429, 431, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
];

const IP_REGEXP = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const CASE_FORM_INITIAL_VALUES: AdvancedMockCaseForm = {
  name: '',
  ip_enable: false,
  ip: '',
  params_mode: 'form',
  params_rows: [{ name: '', value: '' }],
  params_json: '{}',
  code: 200,
  delay: 0,
  headers: [{ name: '', value: '' }],
  res_body: '{}'
};

const HTTP_CODE_OPTIONS = ADV_MOCK_HTTP_CODES.map(code => ({ label: String(code), value: String(code) }));

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

function normalizeCaseKeyValues(value: unknown): AdvancedMockKeyValue[] {
  if (!Array.isArray(value)) return [{ name: '', value: '' }];
  const rows = value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name),
        value: toStringValue(source.value)
      };
    })
    .filter(item => item.name || item.value);
  return rows.length > 0 ? rows : [{ name: '', value: '' }];
}

function normalizeCaseParams(
  value: unknown
): Pick<AdvancedMockCaseForm, 'params_mode' | 'params_rows' | 'params_json'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      params_mode: 'form',
      params_rows: [{ name: '', value: '' }],
      params_json: '{}'
    };
  }

  const paramsObject = value as Record<string, unknown>;
  const keys = Object.keys(paramsObject);
  if (keys.length === 0) {
    return {
      params_mode: 'form',
      params_rows: [{ name: '', value: '' }],
      params_json: '{}'
    };
  }

  const primitiveOnly = keys.every(key => {
    const param = paramsObject[key];
    return (
      typeof param === 'string' ||
      typeof param === 'number' ||
      typeof param === 'boolean' ||
      param == null
    );
  });

  if (primitiveOnly) {
    return {
      params_mode: 'form',
      params_rows: keys.map(key => ({
        name: key,
        value: toStringValue(paramsObject[key])
      })),
      params_json: JSON.stringify(paramsObject, null, 2)
    };
  }

  return {
    params_mode: 'json',
    params_rows: [{ name: '', value: '' }],
    params_json: JSON.stringify(paramsObject, null, 2)
  };
}

function formatCaseUpdateTime(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return new Date(num * 1000).toLocaleString();
}

export function AdvancedMockPluginTab(props: { projectId: number; interfaceData: Record<string, unknown> }) {
  const interfaceId = Number(props.interfaceData._id || 0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enable, setEnable] = useState(false);
  const [script, setScript] = useState('');
  const [loadedId, setLoadedId] = useState(0);
  const [activeTab, setActiveTab] = useState<'case' | 'script'>('case');
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseRows, setCaseRows] = useState<AdvancedMockCaseRecord[]>([]);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [casePreparing, setCasePreparing] = useState(false);
  const [editingCase, setEditingCase] = useState<AdvancedMockCaseRecord | null>(null);
  const [caseForm] = useRcForm<AdvancedMockCaseForm>();

  const watchParamsMode = useWatch('params_mode', caseForm) || 'form';
  const watchIpEnable = useWatch('ip_enable', caseForm) === true;

  async function convertSchemaToJson(schemaText: string): Promise<string | null> {
    try {
      const schema = json5.parse(schemaText);
      const response = await fetch('/api/interface/schema2json', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schema,
          required: true
        })
      });
      const payload = await response.json();
      return JSON.stringify(payload, null, 2);
    } catch (_error) {
      return null;
    }
  }

  async function loadCaseList() {
    if (interfaceId <= 0) {
      setCaseRows([]);
      return;
    }
    setCaseLoading(true);
    try {
      const res = await getJson<AdvancedMockCaseRecord[]>(
        `/api/plugin/advmock/case/list?interface_id=${interfaceId}`
      );
      if (res.errcode !== 0) {
        message.error(res.errmsg || '加载期望列表失败');
        return;
      }
      setCaseRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      message.error(`加载期望列表失败: ${String((error as Error).message || error)}`);
    } finally {
      setCaseLoading(false);
    }
  }

  useEffect(() => {
    if (interfaceId <= 0) {
      setEnable(false);
      setScript('');
      setCaseRows([]);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<Record<string, unknown>>(
          `/api/plugin/advmock/get?interface_id=${interfaceId}`
        );
        if (!active) return;
        if (res.errcode === 0 && res.data) {
          setEnable(res.data.enable === true);
          setScript(toStringValue(res.data.mock_script));
        } else {
          setEnable(false);
          setScript('');
        }
      } catch (error) {
        if (!active) return;
        message.error(`加载高级 Mock 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) {
          setLoading(false);
          setLoadedId(interfaceId);
        }
      }
    }
    void load();
    void loadCaseList();
    return () => {
      active = false;
    };
  }, [interfaceId]);

  async function getDefaultCaseFormValue() {
    const nextResBodyRaw = toStringValue(props.interfaceData.res_body);
    const isResponseSchema = props.interfaceData.res_body_is_json_schema === true;
    const convertedResBody =
      isResponseSchema && nextResBodyRaw.trim()
        ? await convertSchemaToJson(nextResBodyRaw)
        : nextResBodyRaw;

    let paramsSeed: unknown = {};
    const reqBodyOtherRaw = toStringValue(props.interfaceData.req_body_other);
    if (reqBodyOtherRaw.trim()) {
      if (props.interfaceData.req_body_is_json_schema === true) {
        const convertedReq = await convertSchemaToJson(reqBodyOtherRaw);
        if (convertedReq) {
          paramsSeed = parseJsonSafe(convertedReq, {});
        }
      } else if (toStringValue(props.interfaceData.req_body_type).toLowerCase() === 'json') {
        paramsSeed = parseJsonSafe(reqBodyOtherRaw, {});
      }
    }
    const defaultParams = normalizeCaseParams(paramsSeed);

    return {
      name: toStringValue(props.interfaceData.title || props.interfaceData.path || '新期望') || '新期望',
      ip_enable: false,
      ip: '',
      params_mode: defaultParams.params_mode,
      params_rows: defaultParams.params_rows,
      params_json: defaultParams.params_json,
      code: 200,
      delay: 0,
      headers: [{ name: '', value: '' }],
      res_body: convertedResBody || '{}'
    } satisfies AdvancedMockCaseForm;
  }

  async function handleOpenCaseModal(record?: AdvancedMockCaseRecord) {
    setCasePreparing(true);
    try {
      if (!record) {
        setEditingCase(null);
        const defaults = await getDefaultCaseFormValue();
        caseForm.setFieldsValue(defaults);
        setCaseModalOpen(true);
        return;
      }
      setEditingCase(record);
      const params = normalizeCaseParams(record.params);
      caseForm.setFieldsValue({
        name: toStringValue(record.name),
        ip_enable: record.ip_enable === true,
        ip: toStringValue(record.ip),
        params_mode: params.params_mode,
        params_rows: params.params_rows,
        params_json: params.params_json,
        code: Number(record.code || 200),
        delay: Number(record.delay || 0),
        headers: normalizeCaseKeyValues(record.headers),
        res_body: toStringValue(record.res_body || '{}')
      });
      setCaseModalOpen(true);
    } catch (error) {
      message.error(`初始化期望编辑器失败: ${String((error as Error).message || error)}`);
    } finally {
      setCasePreparing(false);
    }
  }

  function closeCaseModal() {
    setCaseModalOpen(false);
    setEditingCase(null);
    caseForm.resetFields();
  }

  function buildCaseParamsFromForm(values: AdvancedMockCaseForm): Record<string, unknown> | null {
    if (values.params_mode === 'json') {
      try {
        const parsed = json5.parse(String(values.params_json || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          message.error('参数过滤 JSON 必须是 object');
          return null;
        }
        return parsed as Record<string, unknown>;
      } catch (error) {
        message.error(`参数过滤 JSON 解析失败: ${String((error as Error).message || error)}`);
        return null;
      }
    }

    const output: Record<string, unknown> = {};
    (values.params_rows || []).forEach(row => {
      const key = toStringValue(row.name).trim();
      if (!key) return;
      const rawValue = toStringValue(row.value);
      output[key] = parseMaybeJson(rawValue);
    });
    return output;
  }

  async function handleSaveCase() {
    if (interfaceId <= 0) {
      message.error('请先选择接口');
      return;
    }
    try {
      const values = await caseForm.validateFields();
      const params = buildCaseParamsFromForm(values);
      if (params == null) return;

      const headers = (values.headers || [])
        .map(item => ({
          name: toStringValue(item.name).trim(),
          value: toStringValue(item.value)
        }))
        .filter(item => item.name);

      const payload: Record<string, unknown> = {
        interface_id: interfaceId,
        project_id: props.projectId,
        name: toStringValue(values.name).trim(),
        ip_enable: values.ip_enable === true,
        ip: toStringValue(values.ip).trim(),
        params,
        code: Number(values.code || 200),
        delay: Number(values.delay || 0),
        headers,
        res_body: toStringValue(values.res_body || '')
      };

      if (editingCase?._id != null) {
        payload.id = editingCase._id;
      }

      setCaseSaving(true);
      const res = await postJson('/api/plugin/advmock/case/save', payload);
      if (res.errcode !== 0) {
        message.error(res.errmsg || '保存期望失败');
        return;
      }
      message.success(editingCase ? '期望已保存' : '期望已添加');
      closeCaseModal();
      await loadCaseList();
    } catch (_error) {
      // rc-field-form validation errors are displayed inline.
    } finally {
      setCaseSaving(false);
    }
  }

  async function handleDeleteCase(row: AdvancedMockCaseRecord) {
    if (row._id == null) return;
    const res = await postJson('/api/plugin/advmock/case/del', { id: row._id });
    if (res.errcode !== 0) {
      message.error(res.errmsg || '删除期望失败');
      return;
    }
    message.success('期望已删除');
    await loadCaseList();
  }

  async function handleToggleCase(row: AdvancedMockCaseRecord) {
    if (row._id == null) return;
    const res = await postJson('/api/plugin/advmock/case/hide', {
      id: row._id,
      enable: row.case_enable === false
    });
    if (res.errcode !== 0) {
      message.error(res.errmsg || '修改期望状态失败');
      return;
    }
    message.success('期望状态已更新');
    await loadCaseList();
  }

  async function handleSave() {
    if (interfaceId <= 0) {
      message.error('请先选择接口');
      return;
    }
    setSaving(true);
    try {
      const res = await postJson('/api/plugin/advmock/save', {
        interface_id: interfaceId,
        project_id: props.projectId,
        enable,
        mock_script: script
      });
      if (res.errcode !== 0) {
        message.error(res.errmsg || '高级 Mock 保存失败');
        return;
      }
      message.success('高级 Mock 保存成功');
    } catch (error) {
      message.error(`高级 Mock 保存失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  if (interfaceId <= 0) {
    return <Alert color="blue" title="请先选择接口后再编辑高级 Mock 配置" />;
  }

  return (
    <Stack className="workspace-stack" gap="sm">
      {loading && loadedId !== interfaceId ? (
        <div className="inline-flex items-center gap-2">
          <Loader size="sm" />
          <Text>加载高级 Mock...</Text>
        </div>
      ) : null}
      <Alert color="blue" title="高级 Mock 脚本支持在 Mock 返回前覆盖响应结构。" />
      <Tabs value={activeTab} onChange={key => setActiveTab(key === 'script' ? 'script' : 'case')}>
        <Tabs.List>
          <Tabs.Tab value="case">期望</Tabs.Tab>
          <Tabs.Tab value="script">脚本</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="case" pt="md">
          <Stack className="workspace-stack" gap="sm">
            <div>
              <Button onClick={() => void handleOpenCaseModal()}>添加期望</Button>
            </div>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>期望名称</Table.Th>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>创建人</Table.Th>
                  <Table.Th>编辑时间</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {caseLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <div className="flex justify-center py-6">
                        <Loader size="sm" />
                      </div>
                    </Table.Td>
                  </Table.Tr>
                ) : caseRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center" py="md">
                        暂无期望
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  caseRows.map((row, index) => (
                    <Table.Tr key={String(row._id || row.name || index)}>
                      <Table.Td>{toStringValue(row.name) || '-'}</Table.Td>
                      <Table.Td>{row.ip_enable ? toStringValue(row.ip) || '-' : '无过滤'}</Table.Td>
                      <Table.Td>{toStringValue(row.username) || '-'}</Table.Td>
                      <Table.Td>{formatCaseUpdateTime(row.up_time)}</Table.Td>
                      <Table.Td>
                        {row.case_enable === false ? <Badge color="gray">未开启</Badge> : <Badge color="green">已开启</Badge>}
                      </Table.Td>
                      <Table.Td>
                        <div className="flex flex-wrap gap-2">
                          <Button size="xs" variant="light" onClick={() => void handleOpenCaseModal(row)}>
                            编辑
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() =>
                              modals.openConfirmModal({
                                title: '确定删除该期望吗？',
                                labels: { confirm: '确定', cancel: '取消' },
                                confirmProps: { color: 'red' },
                                onConfirm: () => void handleDeleteCase(row)
                              })
                            }
                          >
                            删除
                          </Button>
                          <Button size="xs" variant="default" onClick={() => void handleToggleCase(row)}>
                            {row.case_enable === false ? '未开启' : '已开启'}
                          </Button>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="script" pt="md">
          <Stack className="workspace-stack" gap="sm">
            <div className="inline-flex items-center gap-3">
              <Text>是否启用</Text>
              <Switch checked={enable} onChange={event => setEnable(event.currentTarget.checked)} />
            </div>
            <Textarea
              value={script}
              onChange={event => setScript(event.currentTarget.value)}
              minRows={14}
              placeholder={'// 例如：\ncontext.mockJson = { code: 0, data: [] };'}
            />
            <div>
              <Button loading={saving} onClick={() => void handleSave()}>
                保存
              </Button>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal
        title={editingCase ? '编辑期望' : '添加期望'}
        opened={caseModalOpen}
        onClose={closeCaseModal}
        size="xl"
      >
        {casePreparing ? (
          <div className="plugin-loading-block flex justify-center py-10">
            <Loader />
          </div>
        ) : (
          <RcForm<AdvancedMockCaseForm> form={caseForm} initialValues={CASE_FORM_INITIAL_VALUES}>
            <Stack>
              <Field<AdvancedMockCaseForm> name="name" rules={[{ required: true, message: '请输入期望名称' }]}>
                {(control, meta) => (
                  <TextInput
                    label="期望名称"
                    value={control.value ?? ''}
                    onChange={event => control.onChange(event.currentTarget.value)}
                    error={meta.errors[0]}
                    placeholder="请输入期望名称"
                  />
                )}
              </Field>

              <div className="plugin-row-start flex flex-col gap-4 md:flex-row">
                <Field<AdvancedMockCaseForm> name="ip_enable" valuePropName="checked">
                  {(control) => (
                    <Switch
                      label="IP 过滤开关"
                      checked={Boolean(control.value)}
                      onChange={event => control.onChange(event.currentTarget.checked)}
                      className="plugin-ip-switch-item"
                    />
                  )}
                </Field>
                <Field<AdvancedMockCaseForm>
                  name="ip"
                  rules={[
                    {
                      async validator(_, value) {
                        if (!watchIpEnable) return;
                        const raw = toStringValue(value).trim();
                        if (!raw) {
                          throw new Error('请输入过滤 IP');
                        }
                        if (!IP_REGEXP.test(raw)) {
                          throw new Error('请输入合法的 IPv4 地址');
                        }
                      }
                    }
                  ]}
                >
                  {(control, meta) => (
                    <TextInput
                      className="plugin-ip-address-item"
                      label="IP 地址"
                      value={control.value ?? ''}
                      onChange={event => control.onChange(event.currentTarget.value)}
                      error={meta.errors[0]}
                      disabled={!watchIpEnable}
                      placeholder="例如 192.168.1.10"
                    />
                  )}
                </Field>
              </div>

              <Field<AdvancedMockCaseForm> name="params_mode">
                {(control) => (
                  <Radio.Group
                    label="参数过滤模式"
                    value={control.value || 'form'}
                    onChange={value => control.onChange(value)}
                  >
                    <div className="mt-2 flex gap-4">
                      <Radio value="form" label="表单" />
                      <Radio value="json" label="JSON" />
                    </div>
                  </Radio.Group>
                )}
              </Field>

              {watchParamsMode === 'form' ? (
                <List name="params_rows">
                  {(fields, { add, remove }) => (
                    <Stack gap="xs">
                      <Text fw={500}>参数过滤</Text>
                      {fields.map(field => (
                        <div key={field.key} className="plugin-field-row flex flex-col gap-3 md:flex-row">
                          <Field name={[field.name, 'name']} rules={[{ required: true, message: '参数名不能为空' }]}>
                            {(control, meta) => (
                              <TextInput
                                className="plugin-field-w280"
                                value={control.value ?? ''}
                                onChange={event => control.onChange(event.currentTarget.value)}
                                error={meta.errors[0]}
                                placeholder="参数名"
                              />
                            )}
                          </Field>
                          <Field name={[field.name, 'value']}>
                            {(control) => (
                              <TextInput
                                className="plugin-field-w360"
                                value={control.value ?? ''}
                                onChange={event => control.onChange(event.currentTarget.value)}
                                placeholder="参数值"
                              />
                            )}
                          </Field>
                          <Button color="red" variant="light" onClick={() => remove(field.name)}>
                            删除
                          </Button>
                        </div>
                      ))}
                      <div>
                        <Button variant="light" onClick={() => add({ name: '', value: '' })}>
                          添加参数
                        </Button>
                      </div>
                    </Stack>
                  )}
                </List>
              ) : (
                <Field<AdvancedMockCaseForm> name="params_json">
                  {(control) => (
                    <Textarea
                      label="参数过滤(JSON)"
                      minRows={6}
                      value={control.value ?? '{}'}
                      onChange={event => control.onChange(event.currentTarget.value)}
                      placeholder='例如: {"status":"ready"}'
                    />
                  )}
                </Field>
              )}

              <div className="plugin-row-start flex flex-col gap-4 md:flex-row">
                <Field<AdvancedMockCaseForm> name="code">
                  {(control) => (
                    <Select
                      className="plugin-field-w220"
                      label="HTTP Code"
                      searchable
                      value={String(control.value ?? 200)}
                      onChange={value => control.onChange(Number(value || 200))}
                      data={HTTP_CODE_OPTIONS}
                    />
                  )}
                </Field>
                <Field<AdvancedMockCaseForm> name="delay">
                  {(control) => (
                    <NumberInput
                      className="plugin-field-w220 workspace-control"
                      label="延时(ms)"
                      min={0}
                      decimalScale={0}
                      value={Number(control.value ?? 0)}
                      onChange={value => control.onChange(typeof value === 'number' ? value : 0)}
                    />
                  )}
                </Field>
              </div>

              <List name="headers">
                {(fields, { add, remove }) => (
                  <Stack gap="xs">
                    <Text fw={500}>HTTP 头</Text>
                    {fields.map(field => (
                      <div key={field.key} className="plugin-field-row flex flex-col gap-3 md:flex-row">
                        <Field name={[field.name, 'name']}>
                          {(control) => (
                            <TextInput
                              className="plugin-field-w280"
                              value={control.value ?? ''}
                              onChange={event => control.onChange(event.currentTarget.value)}
                              placeholder="Header 名称"
                            />
                          )}
                        </Field>
                        <Field name={[field.name, 'value']}>
                          {(control) => (
                            <TextInput
                              className="plugin-field-w360"
                              value={control.value ?? ''}
                              onChange={event => control.onChange(event.currentTarget.value)}
                              placeholder="Header 值"
                            />
                          )}
                        </Field>
                        <Button color="red" variant="light" onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </div>
                    ))}
                    <div>
                      <Button variant="light" onClick={() => add({ name: '', value: '' })}>
                        添加 HTTP 头
                      </Button>
                    </div>
                  </Stack>
                )}
              </List>

              <Field<AdvancedMockCaseForm> name="res_body" rules={[{ required: true, message: '请输入响应 Body' }]}>
                {(control, meta) => (
                  <Textarea
                    label="响应 Body"
                    minRows={10}
                    value={control.value ?? ''}
                    onChange={event => control.onChange(event.currentTarget.value)}
                    error={meta.errors[0]}
                    placeholder='例如: {"code":200,"data":[]}'
                  />
                )}
              </Field>

              <div className="flex justify-end gap-3">
                <Button variant="default" onClick={closeCaseModal}>
                  取消
                </Button>
                <Button loading={caseSaving} onClick={() => void handleSaveCase()}>
                  {editingCase ? '保存' : '添加'}
                </Button>
              </div>
            </Stack>
          </RcForm>
        )}
      </Modal>
    </Stack>
  );
}
