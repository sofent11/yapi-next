import { Alert, AutoComplete, Button, Card, Form, Input, Radio, Select, Space, Switch, Tabs, Tooltip, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName } from '../../../utils/http-method';
import { legacyNameValidator } from '../../../utils/legacy-validation';
import { SchemaModeEditor } from './SchemaModeEditor';

const { Text } = Typography;

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

export function InterfaceEditTab(props: InterfaceEditTabProps) {
  const methodSelectOptions = props.runMethods.map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));

  return (
    <div className="interface-edit">
      {props.editConflictState.status === 'loading' ? (
        <Card loading />
      ) : props.editConflictState.status === 'locked' ? (
        <Alert
          type="warning"
          showIcon
          message={
            <span>
              <Link to={`/user/profile/${props.editConflictState.uid}`}>
                <b>{props.editConflictState.username}</b>
              </Link>
              <span> 正在编辑该接口，请稍后再试...</span>
            </span>
          }
        />
      ) : (
        <>
          {props.editConflictState.status === 'error' ? (
            <Alert
              className="legacy-edit-conflict-alert"
              type="warning"
              showIcon
              message="多人编辑冲突检测暂时不可用，请稍后重试。"
            />
          ) : null}
          <Form<InterfaceEditFormValues> form={props.form} layout="vertical">
            <SectionCard title="基本设置" className="panel-sub legacy-edit-section">
              <Form.Item label="接口名称" name="title" rules={[{ required: true, validator: legacyNameValidator('接口') }]}>
                <Input />
              </Form.Item>
              <Form.Item label="选择分类" name="catid" rules={[{ required: true, message: '请选择分类' }]}>
                <Select
                  options={props.catRows.map(item => ({
                    label: item.name,
                    value: Number(item._id || 0)
                  }))}
                />
              </Form.Item>
              <Form.Item
                label={
                  <span>
                    接口路径&nbsp;
                    <Tooltip
                      title={
                        <div>
                          <p>1. 支持动态路由，例如: /api/user/{'{id}'}</p>
                          <p>2. 支持 ?controller=xxx 的 QueryRouter，普通 Query 参数请配置在 Query 区</p>
                        </div>
                      }
                    >
                      <span className="legacy-edit-help-trigger">?</span>
                    </Tooltip>
                  </span>
                }
                required
              >
                <Space.Compact className="legacy-edit-path-compact">
                  <Form.Item name="method" noStyle>
                    <Select
                      className="legacy-edit-method-select"
                      options={methodSelectOptions}
                      onChange={(nextMethod: string) => {
                        if (!props.supportsRequestBody(nextMethod) && props.reqRadioType === 'req-body') {
                          props.onReqRadioTypeChange('req-query');
                        }
                      }}
                    />
                  </Form.Item>
                  <Tooltip title="接口基本路径，可在项目设置里修改">
                    <Input disabled value={props.basepath || ''} className="legacy-edit-basepath-input" />
                  </Tooltip>
                  <Form.Item name="path" noStyle rules={[{ required: true, message: '请输入接口路径' }]}>
                    <Input
                      placeholder="/api/user/{id}"
                      onBlur={event => {
                        props.form.setFieldValue('path', props.normalizePathInput(event.target.value));
                      }}
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
              <Form.List name="req_params">
                {fields => (
                  <Space direction="vertical" className="legacy-edit-full-width-stack">
                    {fields.length > 0 ? <Text strong>路径参数</Text> : null}
                    {fields.map(field => (
                      <Space key={field.key} align="start" wrap className="legacy-edit-row-wrap">
                        <Form.Item label={field.name === 0 ? '参数名' : ''} name={[field.name, 'name']} className="legacy-edit-field-w220">
                          <Input disabled />
                        </Form.Item>
                        <Form.Item
                          label={field.name === 0 ? '示例' : ''}
                          name={[field.name, 'example']}
                          className="legacy-edit-field-min220-flex"
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item
                          label={field.name === 0 ? '备注' : ''}
                          name={[field.name, 'desc']}
                          className="legacy-edit-field-min260-flex"
                        >
                          <Input />
                        </Form.Item>
                      </Space>
                    ))}
                  </Space>
                )}
              </Form.List>
              <Space wrap className="legacy-edit-row-wrap">
                <Form.Item label="状态" name="status" className="legacy-edit-field-min140">
                  <Select
                    options={[
                      { label: '已完成', value: 'done' },
                      { label: '未完成', value: 'undone' }
                    ]}
                  />
                </Form.Item>
              </Space>
              <Form.Item label="Tag" name="tag">
                <Select
                  mode="multiple"
                  placeholder="请选择 Tag"
                  options={props.projectTagOptions}
                  popupRender={menu => (
                    <div>
                      {menu}
                      <div className="legacy-edit-tag-setting-entry">
                        <Button type="link" size="small" onClick={props.onOpenTagSetting}>
                          Tag 设置
                        </Button>
                      </div>
                    </div>
                  )}
                />
              </Form.Item>
              {props.customField?.enable ? (
                <Form.Item label={props.customField.name || '自定义字段'} name="custom_field_value">
                  <Input />
                </Form.Item>
              ) : null}
            </SectionCard>

            <SectionCard title="请求参数设置" className="panel-sub legacy-edit-section">
              <Radio.Group
                value={props.reqRadioType}
                onChange={event => props.onReqRadioTypeChange(event.target.value)}
                className="legacy-edit-type-switch"
              >
                {props.supportsRequestBody(props.form.getFieldValue('method')) ? <Radio.Button value="req-body">Body</Radio.Button> : null}
                <Radio.Button value="req-query">Query</Radio.Button>
                <Radio.Button value="req-headers">Headers</Radio.Button>
              </Radio.Group>

              <div className={props.reqRadioType === 'req-query' ? 'legacy-edit-pane-visible' : 'legacy-edit-pane-hidden'}>
                <Space className="legacy-edit-list-toolbar">
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      const list = props.sanitizeReqQuery(props.form.getFieldValue('req_query'));
                      props.form.setFieldValue('req_query', [...list, { name: '', required: '1', desc: '', example: '' }]);
                    }}
                  >
                    添加Query参数
                  </Button>
                  <Button size="small" onClick={() => props.onOpenBulkImport('req_query')}>
                    批量添加
                  </Button>
                </Space>
                <Form.List name="req_query">
                  {(fields, { remove }) => (
                    <Space direction="vertical" className="legacy-edit-full-width-stack">
                      {fields.map(field => (
                        <Space key={field.key} align="start" wrap className="legacy-edit-row-wrap">
                          <Form.Item label={field.name === 0 ? '参数名' : ''} name={[field.name, 'name']} className="legacy-edit-field-w180">
                            <Input placeholder="name" />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '必需' : ''}
                            name={[field.name, 'required']}
                            initialValue="1"
                            className="legacy-edit-field-w100"
                          >
                            <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '示例' : ''}
                            name={[field.name, 'example']}
                            className="legacy-edit-field-min180-flex"
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '备注' : ''}
                            name={[field.name, 'desc']}
                            className="legacy-edit-field-min220-flex"
                          >
                            <Input />
                          </Form.Item>
                          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                    </Space>
                  )}
                </Form.List>
              </div>

              <div className={props.reqRadioType === 'req-headers' ? 'legacy-edit-pane-visible' : 'legacy-edit-pane-hidden'}>
                <Space className="legacy-edit-list-toolbar">
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      const list = props.sanitizeReqHeaders(props.form.getFieldValue('req_headers'));
                      props.form.setFieldValue('req_headers', [...list, { name: '', value: '', required: '1', desc: '', example: '' }]);
                    }}
                  >
                    添加Header
                  </Button>
                </Space>
                <Form.List name="req_headers">
                  {(fields, { remove }) => (
                    <Space direction="vertical" className="legacy-edit-full-width-stack">
                      {fields.map(field => (
                        <Space key={field.key} align="start" wrap className="legacy-edit-row-wrap">
                          <Form.Item label={field.name === 0 ? '参数名' : ''} name={[field.name, 'name']} className="legacy-edit-field-w180">
                            <AutoComplete
                              options={props.httpRequestHeaders.map(item => ({ label: item, value: item }))}
                              filterOption={(inputValue, option) =>
                                String(option?.value || '')
                                  .toUpperCase()
                                  .includes(String(inputValue || '').toUpperCase())
                              }
                              placeholder="name"
                            />
                          </Form.Item>
                          <Form.Item label={field.name === 0 ? '参数值' : ''} name={[field.name, 'value']} className="legacy-edit-field-w200">
                            <Input placeholder="value" />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '必需' : ''}
                            name={[field.name, 'required']}
                            initialValue="1"
                            className="legacy-edit-field-w100"
                          >
                            <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '示例' : ''}
                            name={[field.name, 'example']}
                            className="legacy-edit-field-min140-flex"
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={field.name === 0 ? '备注' : ''}
                            name={[field.name, 'desc']}
                            className="legacy-edit-field-min180-flex"
                          >
                            <Input />
                          </Form.Item>
                          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Space>
                      ))}
                    </Space>
                  )}
                </Form.List>
              </div>

              <div className={props.reqRadioType === 'req-body' ? 'legacy-edit-pane-visible' : 'legacy-edit-pane-hidden'}>
                <Form.Item label="Body 类型" name="req_body_type">
                  <Radio.Group>
                    <Radio value="form">form</Radio>
                    <Radio value="json">json</Radio>
                    <Radio value="file">file</Radio>
                    <Radio value="raw">raw</Radio>
                  </Radio.Group>
                </Form.Item>

                {props.editBodyType === 'form' ? (
                  <>
                    <Space className="legacy-edit-list-toolbar">
                      <Button
                        size="small"
                        type="primary"
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
                      <Button size="small" onClick={() => props.onOpenBulkImport('req_body_form')}>
                        批量添加
                      </Button>
                    </Space>
                    <Form.List name="req_body_form">
                      {(fields, { remove }) => (
                        <Space direction="vertical" className="legacy-edit-full-width-stack">
                          {fields.map(field => (
                            <Space key={field.key} align="start" wrap className="legacy-edit-row-wrap">
                              <Form.Item label={field.name === 0 ? '参数名' : ''} name={[field.name, 'name']} className="legacy-edit-field-w180">
                                <Input />
                              </Form.Item>
                              <Form.Item
                                label={field.name === 0 ? '类型' : ''}
                                name={[field.name, 'type']}
                                initialValue="text"
                                className="legacy-edit-field-w100"
                              >
                                <Select options={[{ label: 'text', value: 'text' }, { label: 'file', value: 'file' }]} />
                              </Form.Item>
                              <Form.Item
                                label={field.name === 0 ? '必需' : ''}
                                name={[field.name, 'required']}
                                initialValue="1"
                                className="legacy-edit-field-w100"
                              >
                                <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                              </Form.Item>
                              <Form.Item
                                label={field.name === 0 ? '示例' : ''}
                                name={[field.name, 'example']}
                                className="legacy-edit-field-min160-flex"
                              >
                                <Input />
                              </Form.Item>
                              <Form.Item
                                label={field.name === 0 ? '备注' : ''}
                                name={[field.name, 'desc']}
                                className="legacy-edit-field-min180-flex"
                              >
                                <Input />
                              </Form.Item>
                              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                            </Space>
                          ))}
                        </Space>
                      )}
                    </Form.List>
                  </>
                ) : props.editBodyType === 'json' ? (
                  <>
                    <Form.Item label="JSON-SCHEMA" name="req_body_is_json_schema" valuePropName="checked">
                      <Switch checkedChildren="开" unCheckedChildren="关" disabled={!props.projectIsJson5} />
                    </Form.Item>
                    {props.editValues.req_body_is_json_schema ? (
                      <>
                        <SchemaModeEditor
                          mode={props.reqSchemaEditorMode}
                          onModeChange={props.onReqSchemaEditorModeChange}
                          fieldName="req_body_other"
                          value={String(props.watchedReqBodyOther || '')}
                          onValueChange={next => props.form.setFieldValue('req_body_other', next)}
                          textLabel="Body 内容"
                          textPlaceholder='{"type":"object","properties":{}}'
                        />
                      </>
                    ) : (
                      <>
                        <Alert
                          type="info"
                          showIcon
                          className="legacy-edit-json-alert"
                          message="基于 Json5，参数描述信息可以使用注释方式编写。"
                        />
                        <Form.Item label="Body 内容" name="req_body_other">
                          <Input.TextArea rows={10} placeholder='{"code":0}' />
                        </Form.Item>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Form.Item label="Body 内容" name="req_body_other">
                      <Input.TextArea rows={10} placeholder={props.editBodyType === 'file' ? 'file body' : 'raw body'} />
                    </Form.Item>
                  </>
                )}
              </div>
            </SectionCard>

            <SectionCard title="返回数据设置" className="panel-sub legacy-edit-section">
              <Form.Item label="返回类型" name="res_body_type">
                <Radio.Group>
                  <Radio.Button value="json">JSON</Radio.Button>
                  <Radio.Button value="raw">RAW</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item label="JSON-SCHEMA" name="res_body_is_json_schema" valuePropName="checked">
                <Switch checkedChildren="json-schema" unCheckedChildren="json" disabled={!props.projectIsJson5} />
              </Form.Item>
              {String(props.editValues.res_body_type || 'json') === 'json' ? (
                <Tabs
                  className="legacy-edit-response-tabs"
                  activeKey={props.resEditorTab}
                  onChange={key => props.onResponseEditorTabChange(key as 'tpl' | 'preview')}
                  items={[
                    {
                      key: 'tpl',
                      label: '模板',
                      children: (
                        <>
                          {props.editValues.res_body_is_json_schema ? (
                            <>
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
                            </>
                          ) : (
                            <>
                              <Alert
                                type="info"
                                showIcon
                                className="legacy-edit-json-alert"
                                message="基于 mockjs 和 json5，参数描述信息可以使用注释方式编写。"
                              />
                              <Form.Item label="返回内容" name="res_body" className="legacy-edit-zero-margin">
                                <Input.TextArea rows={12} />
                              </Form.Item>
                            </>
                          )}
                        </>
                      )
                    },
                    {
                      key: 'preview',
                      label: '预览',
                      children: (
                        <Input.TextArea
                          rows={12}
                          readOnly
                          value={props.resPreviewText}
                          placeholder="切换到预览时会自动生成 mock 预览"
                        />
                      )
                    }
                  ]}
                />
              ) : (
                <Form.Item label="返回内容" name="res_body">
                  <Input.TextArea rows={12} />
                </Form.Item>
              )}
            </SectionCard>

            <SectionCard title="备注" className="panel-sub legacy-edit-section">
              <Form.Item label="描述" name="desc">
                <Input.TextArea rows={6} />
              </Form.Item>
            </SectionCard>

            <SectionCard title="其他" className="panel-sub legacy-edit-section">
              <Form.Item
                label="消息通知"
                name="switch_notice"
                valuePropName="checked"
                extra="开启消息通知，可在项目设置中统一修改"
              >
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item
                label="开放接口"
                name="api_opened"
                valuePropName="checked"
                extra="开放接口可在导出时按公开状态筛选"
              >
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </SectionCard>

            <div className="legacy-edit-footer legacy-edit-footer-sticky">
              <Text type="secondary">修改后请保存，离开页面时会拦截未保存变更。</Text>
              <Button type="primary" onClick={props.onSave} loading={props.saving}>
                保存接口
              </Button>
            </div>
          </Form>
        </>
      )}
    </div>
  );
}
