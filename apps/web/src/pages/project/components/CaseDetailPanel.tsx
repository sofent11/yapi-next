import { Alert, AutoComplete, Button, Card, Descriptions, Form, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { ClearOutlined, CopyOutlined, DeleteOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { FilterBar, SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName, normalizeHttpMethod } from '../../../utils/http-method';
import type { AutoTestResultRow, CaseDetailData, CaseEditFormValues } from './collection-types';

const { Text } = Typography;

type CaseDetailPanelProps = {
  projectId: number;
  detail: CaseDetailData;
  canEdit: boolean;
  autoTestRunning: boolean;
  saveLoading: boolean;
  caseForm: FormInstance<CaseEditFormValues>;
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
  onFormatCaseRunQuery: () => void;
  onFormatCaseRunHeaders: () => void;
  onFormatCaseRunBody: () => void;
  onCopyCaseRunQuery: () => void;
  onCopyCaseRunHeaders: () => void;
  onCopyCaseRunBody: () => void;
  onCopyCaseRunResponse: () => void;
  onCopyCaseResult: () => void;
  onClearCaseRunQuery: () => void;
  onClearCaseRunHeaders: () => void;
  onClearCaseRunBody: () => void;
  onClearCaseRunResponse: () => void;
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
  const methodOptions = props.runMethods.map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));
  return (
    <Card>
      <FilterBar
        className="legacy-interface-list-toolbar legacy-case-toolbar"
        left={<Text strong>{String(props.detail.casename || '测试用例')}</Text>}
        right={
          <Space size={8} wrap>
            <Button loading={props.autoTestRunning} onClick={props.onRunAutoTest}>
              运行测试
            </Button>
            <Button onClick={props.onNavigateCollection}>
              返回集合
            </Button>
            {interfaceId > 0 ? (
              <Button onClick={props.onNavigateInterface}>
                对应接口
              </Button>
            ) : null}
            {props.canEdit ? (
              <>
                <Button icon={<CopyOutlined />} onClick={props.onCopyCase}>
                  克隆用例
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={props.onDeleteCase}>
                  删除用例
                </Button>
                <Button type="primary" loading={props.saveLoading} onClick={props.onSaveCase}>
                  保存用例
                </Button>
              </>
            ) : null}
          </Space>
        }
      />
      <Form<CaseEditFormValues> form={props.caseForm} layout="vertical">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="接口">
            <Space>
              <span className={getHttpMethodBadgeClassName(props.detail.method)}>
                {normalizeHttpMethod(String(props.detail.method || 'GET'))}
              </span>
              <span>{String(props.detail.path || props.detail.title || '-')}</span>
              {interfaceId > 0 ? <Link to={`/project/${props.projectId}/interface/api/${interfaceId}`}>查看接口</Link> : null}
            </Space>
          </Descriptions.Item>
        </Descriptions>

        <div className="legacy-case-form-main">
          <Form.Item label="用例名称" name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input disabled={!props.canEdit} />
          </Form.Item>
          <Space className="legacy-case-form-meta-row" align="start">
            <Form.Item label="环境" name="case_env" className="legacy-case-form-env-item">
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
            <Form.Item label="启用脚本" name="enable_script" valuePropName="checked" className="legacy-case-form-switch-item">
              <Switch disabled={!props.canEdit} checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item label="Body 类型" name="req_body_type" className="legacy-case-form-bodytype-item">
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
      <SectionCard title="测试结果" className="legacy-case-section">
        <div className="legacy-case-section-head">
          <Text strong>最近一次测试结果</Text>
          <Space size={4}>
            <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCaseResult} disabled={!props.currentCaseReport}>
              复制结果
            </Button>
          </Space>
        </div>
        {props.currentCaseReport ? (
          <Space direction="vertical" className="legacy-case-result-stack" size={10}>
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
                    ? props.currentCaseReport.validRes.map(item => String(item.message || '')).join('\n')
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
      </SectionCard>
      <SectionCard title="调试请求" className="legacy-case-section">
        <Space direction="vertical" className="legacy-case-debug-stack">
          <Space wrap className="legacy-case-debug-toolbar">
            <Select
              value={props.caseRunMethod}
              onChange={props.onSetCaseRunMethod}
              className="legacy-case-debug-method-select"
              options={methodOptions}
            />
            <Input
              value={props.caseRunPath}
              onChange={event => props.onSetCaseRunPath(event.target.value)}
              className="legacy-case-debug-path-input"
            />
            <Button type="primary" loading={props.caseRunLoading} onClick={props.onRunCaseRequest}>
              发送请求
            </Button>
          </Space>
          <Alert type="info" showIcon message="调试请求参数需使用 JSON 格式" />
          <div className="legacy-run-section-head">
            <Text strong>Query</Text>
            <Space size={4} className="legacy-run-section-actions">
              <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatCaseRunQuery}>
                格式化
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCaseRunQuery}>
                复制
              </Button>
              <Button size="small" icon={<ClearOutlined />} onClick={props.onClearCaseRunQuery}>
                清空
              </Button>
            </Space>
          </div>
          <Input.TextArea rows={4} value={props.caseRunQuery} onChange={event => props.onSetCaseRunQuery(event.target.value)} />
          <div className="legacy-run-section-head">
            <Text strong>Headers</Text>
            <Space size={4} className="legacy-run-section-actions">
              <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatCaseRunHeaders}>
                格式化
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCaseRunHeaders}>
                复制
              </Button>
              <Button size="small" icon={<ClearOutlined />} onClick={props.onClearCaseRunHeaders}>
                清空
              </Button>
            </Space>
          </div>
          <Input.TextArea rows={4} value={props.caseRunHeaders} onChange={event => props.onSetCaseRunHeaders(event.target.value)} />
          <div className="legacy-run-section-head">
            <Text strong>Body</Text>
            <Space size={4} className="legacy-run-section-actions">
              <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatCaseRunBody}>
                格式化
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCaseRunBody}>
                复制
              </Button>
              <Button size="small" icon={<ClearOutlined />} onClick={props.onClearCaseRunBody}>
                清空
              </Button>
            </Space>
          </div>
          <Input.TextArea rows={6} value={props.caseRunBody} onChange={event => props.onSetCaseRunBody(event.target.value)} />
          <div className="legacy-run-section-head">
            <Text strong>响应</Text>
            <Space size={4} className="legacy-run-section-actions">
              <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyCaseRunResponse} disabled={!props.caseRunResponse}>
                复制
              </Button>
              <Button size="small" icon={<ClearOutlined />} onClick={props.onClearCaseRunResponse} disabled={!props.caseRunResponse}>
                清空
              </Button>
            </Space>
          </div>
          <Input.TextArea rows={10} value={props.caseRunResponse} readOnly placeholder="点击“发送请求”后显示结果" />
        </Space>
      </SectionCard>
    </Card>
  );
}
