import { Alert, AutoComplete, Button, Card, Descriptions, Form, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Text } = Typography;

type AutoTestResultRow = {
  id: string;
  name: string;
  path: string;
  code: number;
  status?: number | null;
  statusText?: string;
  validRes?: Array<{ message?: string }>;
  params?: unknown;
  res_header?: unknown;
  res_body?: unknown;
};

type CaseDetailPanelProps = {
  projectId: number;
  detail: Record<string, unknown>;
  canEdit: boolean;
  autoTestRunning: boolean;
  saveLoading: boolean;
  caseForm: any;
  caseEnvOptions: Array<{ label: string; value: string }>;
  runMethods: readonly string[];
  currentCaseReport: AutoTestResultRow | null;
  caseRunMethod: string;
  caseRunPath: string;
  caseRunQuery: string;
  caseRunHeaders: string;
  caseRunBody: string;
  caseRunResponse: string;
  caseRunLoading: boolean;
  stringifyPretty: (value: unknown) => string;
  onSetCaseRunMethod: (value: string) => void;
  onSetCaseRunPath: (value: string) => void;
  onSetCaseRunQuery: (value: string) => void;
  onSetCaseRunHeaders: (value: string) => void;
  onSetCaseRunBody: (value: string) => void;
  onRunAutoTest: () => void;
  onNavigateCollection: () => void;
  onNavigateInterface: () => void;
  onCopyCase: () => void;
  onDeleteCase: () => void;
  onSaveCase: () => void;
  onRunCaseRequest: () => void;
};

export function CaseDetailPanel(props: CaseDetailPanelProps) {
  const interfaceId = Number(props.detail.interface_id || 0);
  return (
    <Card>
      <div className="legacy-interface-list-toolbar">
        <Text strong>{String(props.detail.casename || '测试用例')}</Text>
        <Space size={8}>
          <Button size="small" loading={props.autoTestRunning} onClick={props.onRunAutoTest}>
            运行测试
          </Button>
          <Button size="small" onClick={props.onNavigateCollection}>
            返回集合
          </Button>
          {interfaceId > 0 ? (
            <Button size="small" onClick={props.onNavigateInterface}>
              对应接口
            </Button>
          ) : null}
        </Space>
        {props.canEdit ? (
          <Space size={8}>
            <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCase}>
              克隆用例
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={props.onDeleteCase}>
              删除用例
            </Button>
            <Button type="primary" size="small" loading={props.saveLoading} onClick={props.onSaveCase}>
              保存用例
            </Button>
          </Space>
        ) : null}
      </div>
      <Form<any> form={props.caseForm} layout="vertical">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="接口">
            <Space>
              <Tag>{String(props.detail.method || '-')}</Tag>
              <span>{String(props.detail.path || props.detail.title || '-')}</span>
              {interfaceId > 0 ? <Link to={`/project/${props.projectId}/interface/api/${interfaceId}`}>查看接口</Link> : null}
            </Space>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 12 }}>
          <Form.Item label="用例名称" name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input disabled={!props.canEdit} />
          </Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item label="环境" name="case_env" style={{ minWidth: 260, flex: 1 }}>
              <AutoComplete
                options={props.caseEnvOptions}
                disabled={!props.canEdit}
                placeholder="如：dev / test / prod"
                filterOption={(inputValue, option) =>
                  String(option?.value || '')
                    .toLowerCase()
                    .includes(String(inputValue || '').toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item label="启用脚本" name="enable_script" valuePropName="checked" style={{ width: 120 }}>
              <Switch disabled={!props.canEdit} checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item label="Body 类型" name="req_body_type" style={{ width: 180 }}>
              <Select
                disabled={!props.canEdit}
                options={[
                  { label: 'form', value: 'form' },
                  { label: 'raw', value: 'raw' },
                  { label: 'json', value: 'json' }
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="测试脚本" name="test_script">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
          <Form.Item label="req_params(JSON Array)" name="req_params_text">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
          <Form.Item label="req_headers(JSON Array)" name="req_headers_text">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
          <Form.Item label="req_query(JSON Array)" name="req_query_text">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
          <Form.Item label="req_body_form(JSON Array)" name="req_body_form_text">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
          <Form.Item label="req_body_other" name="req_body_other">
            <Input.TextArea rows={6} disabled={!props.canEdit} />
          </Form.Item>
        </div>
      </Form>
      <Card size="small" title="测试结果" style={{ marginTop: 16 }}>
        {props.currentCaseReport ? (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Space wrap>
              <Tag
                color={
                  Number(props.currentCaseReport.code || -1) === 0
                    ? 'success'
                    : Number(props.currentCaseReport.code || -1) === 1
                      ? 'warning'
                      : 'error'
                }
              >
                {Number(props.currentCaseReport.code || -1) === 0
                  ? '通过'
                  : Number(props.currentCaseReport.code || -1) === 1
                    ? '失败'
                    : '异常'}
              </Tag>
              <span>HTTP Status: {String(props.currentCaseReport.status ?? '-')}</span>
              <span>{String(props.currentCaseReport.statusText || '')}</span>
            </Space>
            <div>
              <Text strong>断言结果</Text>
              <Input.TextArea
                rows={4}
                readOnly
                value={
                  Array.isArray(props.currentCaseReport.validRes) && props.currentCaseReport.validRes.length > 0
                    ? props.currentCaseReport.validRes.map((item: any) => String(item.message || '')).join('\n')
                    : '无'
                }
              />
            </div>
            <div>
              <Text strong>请求参数</Text>
              <Input.TextArea rows={4} readOnly value={props.stringifyPretty(props.currentCaseReport.params)} />
            </div>
            <div>
              <Text strong>响应头</Text>
              <Input.TextArea rows={4} readOnly value={props.stringifyPretty(props.currentCaseReport.res_header)} />
            </div>
            <div>
              <Text strong>响应体</Text>
              <Input.TextArea rows={8} readOnly value={props.stringifyPretty(props.currentCaseReport.res_body)} />
            </div>
          </Space>
        ) : (
          <div>
            <Alert type="info" showIcon message="暂无测试结果" description="点击“运行测试”后可在此查看断言和响应详情。" />
          </div>
        )}
      </Card>
      <Card size="small" title="调试请求" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              value={props.caseRunMethod}
              onChange={props.onSetCaseRunMethod}
              style={{ width: 120 }}
              options={props.runMethods.map(item => ({ label: item, value: item }))}
            />
            <Input value={props.caseRunPath} onChange={event => props.onSetCaseRunPath(event.target.value)} style={{ minWidth: 420 }} />
            <Button type="primary" loading={props.caseRunLoading} onClick={props.onRunCaseRequest}>
              发送请求
            </Button>
          </Space>
          <Alert type="info" showIcon message="调试请求参数需使用 JSON 格式" />
          <Text strong>Query</Text>
          <Input.TextArea rows={4} value={props.caseRunQuery} onChange={event => props.onSetCaseRunQuery(event.target.value)} />
          <Text strong>Headers</Text>
          <Input.TextArea rows={4} value={props.caseRunHeaders} onChange={event => props.onSetCaseRunHeaders(event.target.value)} />
          <Text strong>Body</Text>
          <Input.TextArea rows={6} value={props.caseRunBody} onChange={event => props.onSetCaseRunBody(event.target.value)} />
          <Text strong>响应</Text>
          <Input.TextArea rows={10} value={props.caseRunResponse} readOnly placeholder="点击“发送请求”后显示结果" />
        </Space>
      </Card>
    </Card>
  );
}
