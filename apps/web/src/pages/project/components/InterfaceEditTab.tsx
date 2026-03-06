import { Link } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Button,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip
} from '@mantine/core';
import { IconHelpCircle, IconTrash } from '@tabler/icons-react';
import RcForm, { Field, List } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';
import { SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName } from '../../../utils/http-method';
import { legacyNameValidator } from '../../../utils/legacy-validation';
import { SchemaModeEditor } from './SchemaModeEditor';

export type InterfaceEditConflictState = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'locked';
  uid?: number;
  username?: string;
};

type InterfaceEditFormValues = {
  method?: string;
  req_body_type?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: string;
  res_body_is_json_schema?: boolean;
  [key: string]: unknown;
};

type InterfaceEditTabProps = {
  editConflictState: InterfaceEditConflictState;
  form: FormInstance<InterfaceEditFormValues>;
  catRows: Array<{ _id: number; name: string }>;
  runMethods: readonly string[];
  supportsRequestBody: (method?: string) => boolean;
  reqRadioType: 'req-body' | 'req-query' | 'req-headers';
  onReqRadioTypeChange: (next: 'req-body' | 'req-query' | 'req-headers') => void;
  basepath?: string;
  normalizePathInput: (path: string) => string;
  projectTagOptions: Array<{ label: string; value: string }>;
  onOpenTagSetting: () => void;
  customField?: { name?: string; enable?: boolean };
  sanitizeReqQuery: (input: unknown) => Array<Record<string, unknown>>;
  sanitizeReqHeaders: (input: unknown) => Array<Record<string, unknown>>;
  sanitizeReqBodyForm: (input: unknown) => Array<Record<string, unknown>>;
  onOpenBulkImport: (fieldName: 'req_query' | 'req_body_form') => void;
  httpRequestHeaders: string[];
  editBodyType: string;
  projectIsJson5?: boolean;
  reqSchemaEditorMode: 'text' | 'visual';
  onReqSchemaEditorModeChange: (mode: 'text' | 'visual') => void;
  watchedReqBodyOther: unknown;
  editValues: Record<string, unknown>;
  resEditorTab: 'tpl' | 'preview';
  onResponseEditorTabChange: (nextTab: 'tpl' | 'preview') => void;
  resSchemaEditorMode: 'text' | 'visual';
  onResSchemaEditorModeChange: (mode: 'text' | 'visual') => void;
  watchedResBody: unknown;
  resPreviewText: string;
  onSave: () => void;
  saving: boolean;
};

type FieldLabelProps = {
  label: string;
  tip?: string;
};

function FieldLabel(props: FieldLabelProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {props.label}
      {props.tip ? (
        <Tooltip label={props.tip} multiline maw={320}>
          <span className="inline-flex cursor-help text-slate-500">
            <IconHelpCircle size={16} />
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}

function DeleteRowButton(props: { onClick: () => void }) {
  return (
    <Button
      color="red"
      variant="light"
      size="xs"
      className="self-end"
      onClick={props.onClick}
      aria-label="删除"
    >
      <IconTrash size={14} />
    </Button>
  );
}

export function InterfaceEditTab(props: InterfaceEditTabProps) {
  const categoryOptions = props.catRows.map(item => ({
    label: item.name,
    value: String(Number(item._id || 0))
  }));
  const tagOptions = props.projectTagOptions.map(item => ({
    label: String(item.label || item.value || ''),
    value: String(item.value || '')
  }));
  const reqPanelOptions = [
    ...(props.supportsRequestBody(props.form.getFieldValue('method'))
      ? [{ label: 'Body', value: 'req-body' as const }]
      : []),
    { label: 'Query', value: 'req-query' as const },
    { label: 'Headers', value: 'req-headers' as const }
  ];

  return (
    <div className="interface-edit">
      {props.editConflictState.status === 'locked' ? (
        <Alert color="yellow" title="接口正在被其他人编辑">
          <span>
            <Link to={`/user/profile/${props.editConflictState.uid}`}>
              <b>{props.editConflictState.username}</b>
            </Link>
            <span> 正在编辑该接口，请稍后再试...</span>
          </span>
        </Alert>
      ) : (
        <>
          {props.editConflictState.status === 'error' ? (
            <Alert className="legacy-edit-conflict-alert" color="yellow" title="多人编辑冲突检测暂时不可用，请稍后重试。" />
          ) : null}

          <RcForm<InterfaceEditFormValues> form={props.form}>
            <div className="flex flex-col gap-4">
              <SectionCard title="基本设置" className="panel-sub legacy-edit-section">
                <div className="flex flex-col gap-4">
                  <Field<InterfaceEditFormValues> name="title" rules={[{ required: true, validator: legacyNameValidator('接口') }]}>
                    {(control, meta) => (
                      <TextInput
                        label="接口名称"
                        value={String(control.value ?? '')}
                        onChange={event => control.onChange(event.currentTarget.value)}
                        error={meta.errors[0]}
                      />
                    )}
                  </Field>

                  <Field<InterfaceEditFormValues> name="catid" rules={[{ required: true, message: '请选择分类' }]}>
                    {(control, meta) => (
                      <Select
                        label="选择分类"
                        value={control.value ? String(control.value) : null}
                        onChange={value => control.onChange(value ? Number(value) : undefined)}
                        data={categoryOptions}
                        error={meta.errors[0]}
                      />
                    )}
                  </Field>

                  <div className="flex flex-col gap-2">
                    <Text fw={500}>
                      <FieldLabel
                        label="接口路径"
                        tip={'1. 支持动态路由，例如: /api/user/{id}\n2. 支持 ?controller=xxx 的 QueryRouter，普通 Query 参数请配置在 Query 区'}
                      />
                    </Text>
                    <div className="legacy-edit-path-compact grid gap-3 md:grid-cols-[140px_180px_minmax(0,1fr)]">
                      <Field<InterfaceEditFormValues> name="method">
                        {(control) => (
                          <Select
                            className="legacy-edit-method-select"
                            value={control.value ? String(control.value) : null}
                            onChange={value => {
                              control.onChange(value || undefined);
                              if (value && !props.supportsRequestBody(value) && props.reqRadioType === 'req-body') {
                                props.onReqRadioTypeChange('req-query');
                              }
                            }}
                            data={props.runMethods.map(item => ({ value: item, label: item }))}
                          />
                        )}
                      </Field>
                      <Tooltip label="接口基本路径，可在项目设置里修改">
                        <TextInput readOnly value={props.basepath || ''} className="legacy-edit-basepath-input" />
                      </Tooltip>
                      <Field<InterfaceEditFormValues> name="path" rules={[{ required: true, message: '请输入接口路径' }]}>
                        {(control, meta) => (
                          <TextInput
                            value={String(control.value ?? '')}
                            onChange={event => control.onChange(event.currentTarget.value)}
                            onBlur={event => control.onChange(props.normalizePathInput(event.currentTarget.value))}
                            placeholder="/api/user/{id}"
                            error={meta.errors[0]}
                          />
                        )}
                      </Field>
                    </div>
                  </div>

                  <List name="req_params">
                    {(fields) => (
                      <div className="flex flex-col gap-3">
                        {fields.length > 0 ? <Text fw={600}>路径参数</Text> : null}
                        {fields.map(field => (
                          <div key={field.key} className="legacy-edit-row-wrap grid gap-3 md:grid-cols-3">
                            <Field name={[field.name, 'name']}>
                              {(control) => (
                                <TextInput
                                  label="参数名"
                                  disabled
                                  value={String(control.value ?? '')}
                                  onChange={event => control.onChange(event.currentTarget.value)}
                                />
                              )}
                            </Field>
                            <Field name={[field.name, 'example']}>
                              {(control) => (
                                <TextInput
                                  label="示例"
                                  value={String(control.value ?? '')}
                                  onChange={event => control.onChange(event.currentTarget.value)}
                                />
                              )}
                            </Field>
                            <Field name={[field.name, 'desc']}>
                              {(control) => (
                                <TextInput
                                  label="备注"
                                  value={String(control.value ?? '')}
                                  onChange={event => control.onChange(event.currentTarget.value)}
                                />
                              )}
                            </Field>
                          </div>
                        ))}
                      </div>
                    )}
                  </List>

                  <div className="legacy-edit-row-wrap max-w-48">
                    <Field<InterfaceEditFormValues> name="status">
                      {(control) => (
                        <Select
                          label="状态"
                          value={control.value ? String(control.value) : null}
                          onChange={value => control.onChange(value || undefined)}
                          data={[
                            { label: '已完成', value: 'done' },
                            { label: '未完成', value: 'undone' }
                          ]}
                        />
                      )}
                    </Field>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Field<InterfaceEditFormValues> name="tag">
                      {(control) => (
                        <MultiSelect
                          label="Tag"
                          searchable
                          value={Array.isArray(control.value) ? control.value.map(item => String(item)) : []}
                          onChange={value => control.onChange(value)}
                          data={tagOptions}
                          placeholder="请选择 Tag"
                        />
                      )}
                    </Field>
                    <div>
                      <Button variant="default" size="xs" onClick={props.onOpenTagSetting}>
                        Tag 设置
                      </Button>
                    </div>
                  </div>

                  {props.customField?.enable ? (
                    <Field<InterfaceEditFormValues> name="custom_field_value">
                      {(control) => (
                        <TextInput
                          label={props.customField.name || '自定义字段'}
                          value={String(control.value ?? '')}
                          onChange={event => control.onChange(event.currentTarget.value)}
                        />
                      )}
                    </Field>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard title="请求参数设置" className="panel-sub legacy-edit-section">
                <div className="flex flex-col gap-4">
                  <SegmentedControl
                    value={props.reqRadioType}
                    onChange={value => props.onReqRadioTypeChange(value as 'req-body' | 'req-query' | 'req-headers')}
                    className="legacy-edit-type-switch"
                    data={reqPanelOptions}
                  />

                  {props.reqRadioType === 'req-query' ? (
                    <div className="flex flex-col gap-4">
                      <div className="legacy-edit-list-toolbar flex flex-wrap gap-2">
                        <Button
                          size="xs"
                          onClick={() => {
                            const list = props.sanitizeReqQuery(props.form.getFieldValue('req_query'));
                            props.form.setFieldValue('req_query', [...list, { name: '', required: '1', desc: '', example: '' }]);
                          }}
                        >
                          添加Query参数
                        </Button>
                        <Button size="xs" variant="default" onClick={() => props.onOpenBulkImport('req_query')}>
                          批量添加
                        </Button>
                      </div>
                      <List name="req_query">
                        {(fields, { remove }) => (
                          <div className="flex flex-col gap-3">
                            {fields.map(field => (
                              <div key={field.key} className="legacy-edit-row-wrap grid gap-3 md:grid-cols-[1.1fr_120px_1fr_1.2fr_80px]">
                                <Field name={[field.name, 'name']}>
                                  {(control) => (
                                    <TextInput
                                      label="参数名"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                      placeholder="name"
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'required']} initialValue="1">
                                  {(control) => (
                                    <Select
                                      label="必需"
                                      value={control.value ? String(control.value) : '1'}
                                      onChange={value => control.onChange(value || '1')}
                                      data={[
                                        { label: '必需', value: '1' },
                                        { label: '非必需', value: '0' }
                                      ]}
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'example']}>
                                  {(control) => (
                                    <TextInput
                                      label="示例"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'desc']}>
                                  {(control) => (
                                    <TextInput
                                      label="备注"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                    />
                                  )}
                                </Field>
                                <DeleteRowButton onClick={() => remove(field.name)} />
                              </div>
                            ))}
                          </div>
                        )}
                      </List>
                    </div>
                  ) : null}

                  {props.reqRadioType === 'req-headers' ? (
                    <div className="flex flex-col gap-4">
                      <div className="legacy-edit-list-toolbar flex flex-wrap gap-2">
                        <Button
                          size="xs"
                          onClick={() => {
                            const list = props.sanitizeReqHeaders(props.form.getFieldValue('req_headers'));
                            props.form.setFieldValue('req_headers', [...list, { name: '', value: '', required: '1', desc: '', example: '' }]);
                          }}
                        >
                          添加Header
                        </Button>
                      </div>
                      <List name="req_headers">
                        {(fields, { remove }) => (
                          <div className="flex flex-col gap-3">
                            {fields.map(field => (
                              <div key={field.key} className="legacy-edit-row-wrap grid gap-3 md:grid-cols-[1.1fr_1fr_120px_1fr_1fr_80px]">
                                <Field name={[field.name, 'name']}>
                                  {(control) => (
                                    <Autocomplete
                                      label="参数名"
                                      value={String(control.value ?? '')}
                                      onChange={control.onChange}
                                      data={props.httpRequestHeaders}
                                      placeholder="name"
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'value']}>
                                  {(control) => (
                                    <TextInput
                                      label="参数值"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                      placeholder="value"
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'required']} initialValue="1">
                                  {(control) => (
                                    <Select
                                      label="必需"
                                      value={control.value ? String(control.value) : '1'}
                                      onChange={value => control.onChange(value || '1')}
                                      data={[
                                        { label: '必需', value: '1' },
                                        { label: '非必需', value: '0' }
                                      ]}
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'example']}>
                                  {(control) => (
                                    <TextInput
                                      label="示例"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                    />
                                  )}
                                </Field>
                                <Field name={[field.name, 'desc']}>
                                  {(control) => (
                                    <TextInput
                                      label="备注"
                                      value={String(control.value ?? '')}
                                      onChange={event => control.onChange(event.currentTarget.value)}
                                    />
                                  )}
                                </Field>
                                <DeleteRowButton onClick={() => remove(field.name)} />
                              </div>
                            ))}
                          </div>
                        )}
                      </List>
                    </div>
                  ) : null}

                  {props.reqRadioType === 'req-body' ? (
                    <div className="flex flex-col gap-4">
                      <Field<InterfaceEditFormValues> name="req_body_type">
                        {(control) => (
                          <div className="flex flex-col gap-2">
                            <Text fw={500}>Body 类型</Text>
                            <SegmentedControl
                              value={String(control.value || 'form')}
                              onChange={value => control.onChange(value)}
                              data={[
                                { label: 'form', value: 'form' },
                                { label: 'json', value: 'json' },
                                { label: 'file', value: 'file' },
                                { label: 'raw', value: 'raw' }
                              ]}
                            />
                          </div>
                        )}
                      </Field>

                      {props.editBodyType === 'form' ? (
                        <>
                          <div className="legacy-edit-list-toolbar flex flex-wrap gap-2">
                            <Button
                              size="xs"
                              onClick={() => {
                                const list = props.sanitizeReqBodyForm(props.form.getFieldValue('req_body_form'));
                                props.form.setFieldValue('req_body_form', [
                                  ...list,
                                  { name: '', type: 'text', required: '1', desc: '', example: '' }
                                ]);
                              }}
                            >
                              添加form参数
                            </Button>
                            <Button size="xs" variant="default" onClick={() => props.onOpenBulkImport('req_body_form')}>
                              批量添加
                            </Button>
                          </div>
                          <List name="req_body_form">
                            {(fields, { remove }) => (
                              <div className="flex flex-col gap-3">
                                {fields.map(field => (
                                  <div key={field.key} className="legacy-edit-row-wrap grid gap-3 md:grid-cols-[1.1fr_120px_120px_1fr_1fr_80px]">
                                    <Field name={[field.name, 'name']}>
                                      {(control) => (
                                        <TextInput
                                          label="参数名"
                                          value={String(control.value ?? '')}
                                          onChange={event => control.onChange(event.currentTarget.value)}
                                        />
                                      )}
                                    </Field>
                                    <Field name={[field.name, 'type']} initialValue="text">
                                      {(control) => (
                                        <Select
                                          label="类型"
                                          value={control.value ? String(control.value) : 'text'}
                                          onChange={value => control.onChange(value || 'text')}
                                          data={[
                                            { label: 'text', value: 'text' },
                                            { label: 'file', value: 'file' }
                                          ]}
                                        />
                                      )}
                                    </Field>
                                    <Field name={[field.name, 'required']} initialValue="1">
                                      {(control) => (
                                        <Select
                                          label="必需"
                                          value={control.value ? String(control.value) : '1'}
                                          onChange={value => control.onChange(value || '1')}
                                          data={[
                                            { label: '必需', value: '1' },
                                            { label: '非必需', value: '0' }
                                          ]}
                                        />
                                      )}
                                    </Field>
                                    <Field name={[field.name, 'example']}>
                                      {(control) => (
                                        <TextInput
                                          label="示例"
                                          value={String(control.value ?? '')}
                                          onChange={event => control.onChange(event.currentTarget.value)}
                                        />
                                      )}
                                    </Field>
                                    <Field name={[field.name, 'desc']}>
                                      {(control) => (
                                        <TextInput
                                          label="备注"
                                          value={String(control.value ?? '')}
                                          onChange={event => control.onChange(event.currentTarget.value)}
                                        />
                                      )}
                                    </Field>
                                    <DeleteRowButton onClick={() => remove(field.name)} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </List>
                        </>
                      ) : null}

                      {props.editBodyType === 'json' ? (
                        <>
                          <Field<InterfaceEditFormValues> name="req_body_is_json_schema" valuePropName="checked">
                            {(control) => (
                              <Switch
                                label="JSON-SCHEMA"
                                checked={Boolean(control.value)}
                                onChange={event => control.onChange(event.currentTarget.checked)}
                                disabled={!props.projectIsJson5}
                              />
                            )}
                          </Field>

                          {props.editValues.req_body_is_json_schema ? (
                            <SchemaModeEditor
                              mode={props.reqSchemaEditorMode}
                              onModeChange={props.onReqSchemaEditorModeChange}
                              fieldName="req_body_other"
                              value={String(props.watchedReqBodyOther || '')}
                              onValueChange={next => props.form.setFieldValue('req_body_other', next)}
                              textLabel="Body 内容"
                              textPlaceholder='{"type":"object","properties":{}}'
                            />
                          ) : (
                            <>
                              <Alert color="blue" className="legacy-edit-json-alert" title="基于 Json5，参数描述信息可以使用注释方式编写。" />
                              <Field<InterfaceEditFormValues> name="req_body_other">
                                {(control) => (
                                  <Textarea
                                    label="Body 内容"
                                    minRows={10}
                                    value={String(control.value ?? '')}
                                    onChange={event => control.onChange(event.currentTarget.value)}
                                    placeholder='{"code":0}'
                                  />
                                )}
                              </Field>
                            </>
                          )}
                        </>
                      ) : null}

                      {props.editBodyType !== 'form' && props.editBodyType !== 'json' ? (
                        <Field<InterfaceEditFormValues> name="req_body_other">
                          {(control) => (
                            <Textarea
                              label="Body 内容"
                              minRows={10}
                              value={String(control.value ?? '')}
                              onChange={event => control.onChange(event.currentTarget.value)}
                              placeholder={props.editBodyType === 'file' ? 'file body' : 'raw body'}
                            />
                          )}
                        </Field>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard title="返回数据设置" className="panel-sub legacy-edit-section">
                <div className="flex flex-col gap-4">
                  <Field<InterfaceEditFormValues> name="res_body_type">
                    {(control) => (
                      <div className="flex flex-col gap-2">
                        <Text fw={500}>返回类型</Text>
                        <SegmentedControl
                          value={String(control.value || 'json')}
                          onChange={value => control.onChange(value)}
                          data={[
                            { label: 'JSON', value: 'json' },
                            { label: 'RAW', value: 'raw' }
                          ]}
                        />
                      </div>
                    )}
                  </Field>

                  <Field<InterfaceEditFormValues> name="res_body_is_json_schema" valuePropName="checked">
                    {(control) => (
                      <Switch
                        label="JSON-SCHEMA"
                        checked={Boolean(control.value)}
                        onChange={event => control.onChange(event.currentTarget.checked)}
                        disabled={!props.projectIsJson5}
                        onLabel="json-schema"
                        offLabel="json"
                      />
                    )}
                  </Field>

                  {String(props.editValues.res_body_type || 'json') === 'json' ? (
                    <Tabs
                      className="legacy-edit-response-tabs"
                      value={props.resEditorTab}
                      onChange={value => props.onResponseEditorTabChange((value as 'tpl' | 'preview') || 'tpl')}
                    >
                      <Tabs.List>
                        <Tabs.Tab value="tpl">模板</Tabs.Tab>
                        <Tabs.Tab value="preview">预览</Tabs.Tab>
                      </Tabs.List>

                      <Tabs.Panel value="tpl" pt="md">
                        {props.editValues.res_body_is_json_schema ? (
                          <SchemaModeEditor
                            mode={props.resSchemaEditorMode}
                            onModeChange={props.onResSchemaEditorModeChange}
                            fieldName="res_body"
                            value={String(props.watchedResBody || '')}
                            onValueChange={next => props.form.setFieldValue('res_body', next)}
                            textLabel="返回内容"
                            hiddenFormItemStyle={{ marginBottom: 0 }}
                            textFormItemStyle={{ marginBottom: 0 }}
                          />
                        ) : (
                          <>
                            <Alert color="blue" className="legacy-edit-json-alert" title="基于 mockjs 和 json5，参数描述信息可以使用注释方式编写。" />
                            <Field<InterfaceEditFormValues> name="res_body">
                              {(control) => (
                                <Textarea
                                  label="返回内容"
                                  minRows={12}
                                  className="legacy-edit-zero-margin"
                                  value={String(control.value ?? '')}
                                  onChange={event => control.onChange(event.currentTarget.value)}
                                />
                              )}
                            </Field>
                          </>
                        )}
                      </Tabs.Panel>

                      <Tabs.Panel value="preview" pt="md">
                        <Textarea
                          minRows={12}
                          readOnly
                          value={props.resPreviewText}
                          placeholder="切换到预览时会自动生成 mock 预览"
                        />
                      </Tabs.Panel>
                    </Tabs>
                  ) : (
                    <Field<InterfaceEditFormValues> name="res_body">
                      {(control) => (
                        <Textarea
                          label="返回内容"
                          minRows={12}
                          value={String(control.value ?? '')}
                          onChange={event => control.onChange(event.currentTarget.value)}
                        />
                      )}
                    </Field>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="备注" className="panel-sub legacy-edit-section">
                <Field<InterfaceEditFormValues> name="desc">
                  {(control) => (
                    <Textarea
                      label="描述"
                      minRows={6}
                      value={String(control.value ?? '')}
                      onChange={event => control.onChange(event.currentTarget.value)}
                    />
                  )}
                </Field>
              </SectionCard>

              <SectionCard title="其他" className="panel-sub legacy-edit-section">
                <div className="flex flex-col gap-4">
                  <Field<InterfaceEditFormValues> name="switch_notice" valuePropName="checked">
                    {(control) => (
                      <div>
                        <Switch
                          label="消息通知"
                          checked={Boolean(control.value)}
                          onChange={event => control.onChange(event.currentTarget.checked)}
                        />
                        <Text c="dimmed" size="sm" mt={6}>
                          开启消息通知，可在项目设置中统一修改
                        </Text>
                      </div>
                    )}
                  </Field>
                  <Field<InterfaceEditFormValues> name="api_opened" valuePropName="checked">
                    {(control) => (
                      <div>
                        <Switch
                          label="开放接口"
                          checked={Boolean(control.value)}
                          onChange={event => control.onChange(event.currentTarget.checked)}
                        />
                        <Text c="dimmed" size="sm" mt={6}>
                          开放接口可在导出时按公开状态筛选
                        </Text>
                      </div>
                    )}
                  </Field>
                </div>
              </SectionCard>

              <div className="legacy-edit-footer legacy-edit-footer-sticky flex flex-wrap items-center justify-between gap-3">
                <Text c="dimmed">修改后请保存，离开页面时会拦截未保存变更。</Text>
                <Button onClick={props.onSave} loading={props.saving}>
                  保存接口
                </Button>
              </div>
            </div>
          </RcForm>
        </>
      )}
    </div>
  );
}
