import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
function normalizeHeaderRow(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name),
        value: toStringValue(source.value)
      };
    })
    .filter(item => item.name);
}

function normalizeSimpleParam(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name || source.key),
        value: toStringValue(source.value || source.example),
        required: source.required === '0' ? '0' : '1',
        desc: toStringValue(source.desc || source.description || '')
      };
    })
    .filter(item => item.name);
}

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
  const [caseForm] = Form.useForm<AdvancedMockCaseForm>();

  const watchParamsMode = Form.useWatch('params_mode', caseForm) || 'form';
  const watchIpEnable = Form.useWatch('ip_enable', caseForm) === true;

  const caseColumns: ColumnsType<AdvancedMockCaseRecord> = [
    {
      title: '期望名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      render: (_value, row) => (row.ip_enable ? toStringValue(row.ip) || '-' : '无过滤')
    },
    {
      title: '创建人',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: value => toStringValue(value) || '-'
    },
    {
      title: '编辑时间',
      dataIndex: 'up_time',
      key: 'up_time',
      width: 180,
      render: value => formatCaseUpdateTime(value)
    },
    {
      title: '状态',
      dataIndex: 'case_enable',
      key: 'case_enable',
      width: 100,
      render: value => (value === false ? <Tag color="default">未开启</Tag> : <Tag color="green">已开启</Tag>)
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => void handleOpenCaseModal(row)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该期望吗？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => void handleDeleteCase(row)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
          <Button size="small" onClick={() => void handleToggleCase(row)}>
            {row.case_enable === false ? '未开启' : '已开启'}
          </Button>
        </Space>
      )
    }
  ];

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
      // antd form validation error is handled by Form.Item
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
    return <Alert type="info" showIcon message="请先选择接口后再编辑高级 Mock 配置" />;
  }

  return (
    <Space direction="vertical" className="legacy-workspace-stack" size={12}>
      {loading && loadedId !== interfaceId ? (
        <Space>
          <Spin size="small" />
          <Text>加载高级 Mock...</Text>
        </Space>
      ) : null}
      <Alert
        type="info"
        showIcon
        message="高级 Mock 脚本支持在 Mock 返回前覆盖响应结构。"
      />
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key === 'script' ? 'script' : 'case')}
        items={[
          {
            key: 'case',
            label: '期望',
            children: (
              <Space direction="vertical" className="legacy-workspace-stack" size={12}>
                <Space>
                  <Button type="primary" onClick={() => void handleOpenCaseModal()}>
                    添加期望
                  </Button>
                </Space>
                <Table
                  size="small"
                  loading={caseLoading}
                  rowKey={row => String(row._id || row.name || Math.random())}
                  pagination={false}
                  columns={caseColumns}
                  dataSource={caseRows}
                />
              </Space>
            )
          },
          {
            key: 'script',
            label: '脚本',
            children: (
              <Space direction="vertical" className="legacy-workspace-stack" size={12}>
                <Space align="center">
                  <Text>是否启用</Text>
                  <Switch checked={enable} onChange={setEnable} />
                </Space>
                <Input.TextArea
                  value={script}
                  onChange={event => setScript(event.target.value)}
                  rows={14}
                  placeholder={'// 例如：\ncontext.mockJson = { code: 0, data: [] };'}
                />
                <Space>
                  <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                    保存
                  </Button>
                </Space>
              </Space>
            )
          }
        ]}
      />
      <Modal
        title={editingCase ? '编辑期望' : '添加期望'}
        open={caseModalOpen}
        onCancel={closeCaseModal}
        onOk={() => void handleSaveCase()}
        okText={editingCase ? '保存' : '添加'}
        cancelText="取消"
        width={860}
        confirmLoading={caseSaving}
        destroyOnHidden
      >
        {casePreparing ? (
          <div className="legacy-plugin-loading-block">
            <Spin />
          </div>
        ) : (
          <Form<AdvancedMockCaseForm>
            form={caseForm}
            layout="vertical"
            initialValues={{
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
            }}
          >
            <Form.Item label="期望名称" name="name" rules={[{ required: true, message: '请输入期望名称' }]}>
              <Input placeholder="请输入期望名称" />
            </Form.Item>
            <Space className="legacy-plugin-row-start" align="start">
              <Form.Item
                label="IP 过滤开关"
                name="ip_enable"
                valuePropName="checked"
                className="legacy-plugin-ip-switch-item"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                className="legacy-plugin-ip-address-item"
                label="IP 地址"
                name="ip"
                rules={[
                  {
                    validator(_, value) {
                      if (!watchIpEnable) return Promise.resolve();
                      const raw = toStringValue(value).trim();
                      if (!raw) {
                        return Promise.reject(new Error('请输入过滤 IP'));
                      }
                      if (!IP_REGEXP.test(raw)) {
                        return Promise.reject(new Error('请输入合法的 IPv4 地址'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <Input disabled={!watchIpEnable} placeholder="例如 192.168.1.10" />
              </Form.Item>
            </Space>
            <Form.Item label="参数过滤模式" name="params_mode">
              <Radio.Group
                options={[
                  { label: '表单', value: 'form' },
                  { label: 'JSON', value: 'json' }
                ]}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
            {watchParamsMode === 'form' ? (
              <Form.List name="params_rows">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="legacy-workspace-stack" size={8}>
                    {fields.map(field => (
                      <Space key={field.key} className="legacy-plugin-field-row" align="baseline">
                        <Form.Item
                          name={[field.name, 'name']}
                          rules={[{ required: true, message: '参数名不能为空' }]}
                          className="legacy-plugin-field-w280"
                        >
                          <Input placeholder="参数名" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'value']} className="legacy-plugin-field-w360">
                          <Input placeholder="参数值" />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ name: '', value: '' })}>
                      添加参数
                    </Button>
                  </Space>
                )}
              </Form.List>
            ) : (
              <Form.Item label="参数过滤(JSON)" name="params_json">
                <Input.TextArea rows={6} placeholder='例如: {"status":"ready"}' />
              </Form.Item>
            )}
            <Space className="legacy-plugin-row-start" align="start">
              <Form.Item label="HTTP Code" name="code" className="legacy-plugin-field-w220">
                <Select
                  showSearch
                  options={ADV_MOCK_HTTP_CODES.map(code => ({ label: String(code), value: code }))}
                />
              </Form.Item>
              <Form.Item label="延时(ms)" name="delay" className="legacy-plugin-field-w220">
                <InputNumber min={0} precision={0} className="legacy-workspace-control" />
              </Form.Item>
            </Space>
            <Form.Item label="HTTP 头">
              <Form.List name="headers">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="legacy-workspace-stack" size={8}>
                    {fields.map(field => (
                      <Space key={field.key} className="legacy-plugin-field-row" align="baseline">
                        <Form.Item name={[field.name, 'name']} className="legacy-plugin-field-w280">
                          <Input placeholder="Header 名称" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'value']} className="legacy-plugin-field-w360">
                          <Input placeholder="Header 值" />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ name: '', value: '' })}>
                      添加 HTTP 头
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item
              label="响应 Body"
              name="res_body"
              rules={[{ required: true, message: '请输入响应 Body' }]}
            >
              <Input.TextArea rows={10} placeholder='例如: {"code":200,"data":[]}' />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Space>
  );
}
