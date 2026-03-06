import { Link } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { IconCopy, IconTrash } from '@tabler/icons-react';
import RcForm, { Field } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';
import { FilterBar, SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName, normalizeHttpMethod } from '../../../utils/http-method';
import type { AutoTestResultRow, CaseDetailData, CaseEditFormValues } from './collection-types';

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

function SectionActions(props: {
  onFormat?: () => void;
  onCopy?: () => void;
  onClear?: () => void;
  disableCopy?: boolean;
  disableClear?: boolean;
}) {
  return (
    <div className="legacy-run-section-actions flex flex-wrap gap-2">
      {props.onFormat ? (
        <Button size="xs" variant="default" onClick={props.onFormat}>
          格式化
        </Button>
      ) : null}
      {props.onCopy ? (
        <Button size="xs" variant="default" onClick={props.onCopy} disabled={props.disableCopy}>
          复制
        </Button>
      ) : null}
      {props.onClear ? (
        <Button size="xs" variant="default" onClick={props.onClear} disabled={props.disableClear}>
          清空
        </Button>
      ) : null}
    </div>
  );
}

export function CaseDetailPanel(props: CaseDetailPanelProps) {
  const interfaceId = Number(props.detail.interface_id || 0);
  const methodOptions = props.runMethods.map(item => ({
    value: item,
    label: item
  }));
  const currentResultCode = Number(props.currentCaseReport?.code || -1);
  const currentResultBadge =
    currentResultCode === 0
      ? { color: 'teal', label: '通过' }
      : currentResultCode === 1
        ? { color: 'yellow', label: '失败' }
        : { color: 'red', label: '异常' };

  return (
    <Card withBorder radius="xl">
      <div className="flex flex-col gap-4">
        <FilterBar
          className="legacy-interface-list-toolbar legacy-case-toolbar"
          left={<Text fw={700}>{String(props.detail.casename || '测试用例')}</Text>}
          right={
            <div className="flex flex-wrap gap-2">
              <Button variant="default" loading={props.autoTestRunning} onClick={props.onRunAutoTest}>
                运行测试
              </Button>
              <Button variant="default" onClick={props.onNavigateCollection}>
                返回集合
              </Button>
              {interfaceId > 0 ? (
                <Button variant="default" onClick={props.onNavigateInterface}>
                  对应接口
                </Button>
              ) : null}
              {props.canEdit ? (
                <>
                  <Button variant="default" leftSection={<IconCopy size={14} />} onClick={props.onCopyCase}>
                    克隆用例
                  </Button>
                  <Button color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={props.onDeleteCase}>
                    删除用例
                  </Button>
                  <Button loading={props.saveLoading} onClick={props.onSaveCase}>
                    保存用例
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        <RcForm<CaseEditFormValues> form={props.caseForm}>
          <div className="grid gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={getHttpMethodBadgeClassName(props.detail.method)}>
                  {normalizeHttpMethod(String(props.detail.method || 'GET'))}
                </span>
                <span>{String(props.detail.path || props.detail.title || '-')}</span>
                {interfaceId > 0 ? (
                  <Link to={`/project/${props.projectId}/interface/api/${interfaceId}`}>查看接口</Link>
                ) : null}
              </div>
            </div>

            <div className="legacy-case-form-main flex flex-col gap-4">
              <Field<CaseEditFormValues> name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
                {(control, meta) => (
                  <TextInput
                    label="用例名称"
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                    error={meta.errors[0]}
                  />
                )}
              </Field>

              <div className="legacy-case-form-meta-row grid gap-4 md:grid-cols-3">
                <Field<CaseEditFormValues> name="case_env">
                  {(control) => (
                    <Autocomplete
                      label="环境"
                      disabled={!props.canEdit}
                      value={String(control.value ?? '')}
                      onChange={control.onChange}
                      data={props.caseEnvOptions.map(item => item.value)}
                      placeholder="如：dev / test / prod"
                    />
                  )}
                </Field>
                <Field<CaseEditFormValues> name="enable_script" valuePropName="checked">
                  {(control) => (
                    <Switch
                      className="legacy-case-form-switch-item"
                      label="启用脚本"
                      disabled={!props.canEdit}
                      checked={Boolean(control.value)}
                      onChange={event => control.onChange(event.currentTarget.checked)}
                    />
                  )}
                </Field>
                <Field<CaseEditFormValues> name="req_body_type">
                  {(control) => (
                    <Select
                      label="Body 类型"
                      disabled={!props.canEdit}
                      value={control.value ? String(control.value) : null}
                      onChange={value => control.onChange(value || undefined)}
                      data={[
                        { label: 'form', value: 'form' },
                        { label: 'raw', value: 'raw' },
                        { label: 'json', value: 'json' }
                      ]}
                    />
                  )}
                </Field>
              </div>

              <Field<CaseEditFormValues> name="test_script">
                {(control) => (
                  <Textarea
                    label="测试脚本"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
              <Field<CaseEditFormValues> name="req_params_text">
                {(control) => (
                  <Textarea
                    label="req_params(JSON Array)"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
              <Field<CaseEditFormValues> name="req_headers_text">
                {(control) => (
                  <Textarea
                    label="req_headers(JSON Array)"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
              <Field<CaseEditFormValues> name="req_query_text">
                {(control) => (
                  <Textarea
                    label="req_query(JSON Array)"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
              <Field<CaseEditFormValues> name="req_body_form_text">
                {(control) => (
                  <Textarea
                    label="req_body_form(JSON Array)"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
              <Field<CaseEditFormValues> name="req_body_other">
                {(control) => (
                  <Textarea
                    label="req_body_other"
                    minRows={6}
                    disabled={!props.canEdit}
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        </RcForm>

        <SectionCard title="测试结果" className="legacy-case-section">
          <div className="flex flex-col gap-3">
            <div className="legacy-case-section-head flex items-center justify-between gap-3">
              <Text fw={600}>最近一次测试结果</Text>
              <Button size="xs" variant="default" onClick={props.onCopyCaseResult} disabled={!props.currentCaseReport}>
                复制结果
              </Button>
            </div>

            {props.currentCaseReport ? (
              <Stack className="legacy-case-result-stack" gap="sm">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge color={currentResultBadge.color} variant="light">
                    {currentResultBadge.label}
                  </Badge>
                  <span>HTTP Status: {String(props.currentCaseReport.status ?? '-')}</span>
                  <span>{String(props.currentCaseReport.statusText || '')}</span>
                </div>
                <div>
                  <Text fw={600}>断言结果</Text>
                  <Textarea
                    minRows={4}
                    readOnly
                    value={
                      Array.isArray(props.currentCaseReport.validRes) && props.currentCaseReport.validRes.length > 0
                        ? props.currentCaseReport.validRes.map(item => String(item.message || '')).join('\n')
                        : '无'
                    }
                  />
                </div>
                <div>
                  <Text fw={600}>请求参数</Text>
                  <Textarea minRows={4} readOnly value={props.stringifyPretty(props.currentCaseReport.params)} />
                </div>
                <div>
                  <Text fw={600}>响应头</Text>
                  <Textarea minRows={4} readOnly value={props.stringifyPretty(props.currentCaseReport.res_header)} />
                </div>
                <div>
                  <Text fw={600}>响应体</Text>
                  <Textarea minRows={8} readOnly value={props.stringifyPretty(props.currentCaseReport.res_body)} />
                </div>
              </Stack>
            ) : (
              <Alert color="blue" title="暂无测试结果">
                点击“运行测试”后可在此查看断言和响应详情。
              </Alert>
            )}
          </div>
        </SectionCard>

        <SectionCard title="调试请求" className="legacy-case-section">
          <div className="legacy-case-debug-stack flex flex-col gap-4">
            <div className="legacy-case-debug-toolbar grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_120px]">
              <Select
                value={props.caseRunMethod}
                onChange={value => {
                  if (value) props.onSetCaseRunMethod(value);
                }}
                className="legacy-case-debug-method-select"
                data={methodOptions}
              />
              <TextInput
                value={props.caseRunPath}
                onChange={event => props.onSetCaseRunPath(event.currentTarget.value)}
                className="legacy-case-debug-path-input"
              />
              <Button loading={props.caseRunLoading} onClick={props.onRunCaseRequest}>
                发送请求
              </Button>
            </div>

            <Alert color="blue" title="调试请求参数需使用 JSON 格式" />

            <div className="flex flex-col gap-2">
              <div className="legacy-run-section-head flex items-center justify-between gap-3">
                <Text fw={600}>Query</Text>
                <SectionActions
                  onFormat={props.onFormatCaseRunQuery}
                  onCopy={props.onCopyCaseRunQuery}
                  onClear={props.onClearCaseRunQuery}
                />
              </div>
              <Textarea minRows={4} value={props.caseRunQuery} onChange={event => props.onSetCaseRunQuery(event.currentTarget.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="legacy-run-section-head flex items-center justify-between gap-3">
                <Text fw={600}>Headers</Text>
                <SectionActions
                  onFormat={props.onFormatCaseRunHeaders}
                  onCopy={props.onCopyCaseRunHeaders}
                  onClear={props.onClearCaseRunHeaders}
                />
              </div>
              <Textarea minRows={4} value={props.caseRunHeaders} onChange={event => props.onSetCaseRunHeaders(event.currentTarget.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="legacy-run-section-head flex items-center justify-between gap-3">
                <Text fw={600}>Body</Text>
                <SectionActions
                  onFormat={props.onFormatCaseRunBody}
                  onCopy={props.onCopyCaseRunBody}
                  onClear={props.onClearCaseRunBody}
                />
              </div>
              <Textarea minRows={6} value={props.caseRunBody} onChange={event => props.onSetCaseRunBody(event.currentTarget.value)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="legacy-run-section-head flex items-center justify-between gap-3">
                <Text fw={600}>响应</Text>
                <SectionActions
                  onCopy={props.onCopyCaseRunResponse}
                  onClear={props.onClearCaseRunResponse}
                  disableCopy={!props.caseRunResponse}
                  disableClear={!props.caseRunResponse}
                />
              </div>
              <Textarea minRows={10} value={props.caseRunResponse} readOnly placeholder="点击“发送请求”后显示结果" />
            </div>
          </div>
        </SectionCard>
      </div>
    </Card>
  );
}
