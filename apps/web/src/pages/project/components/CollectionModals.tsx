import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { normalizeHttpMethod } from '../../../utils/http-method';
import type { AddCaseFormValues, ColFormValues, CommonSettingFormValues } from './collection-types';

const { Text } = Typography;

type ImportInterfaceRow = {
  key: string;
  id?: number;
  title: string;
  path?: string;
  method?: string;
  status?: string;
  isCategory: boolean;
  children?: ImportInterfaceRow[];
};

export type CollectionModalsProps = {
  colModalType: 'add' | 'edit';
  colModalOpen: boolean;
  colForm: FormInstance<ColFormValues>;
  colModalLoading: boolean;
  onCancelColModal: () => void;
  onSubmitCol: (values: ColFormValues) => void;
  importModalOpen: boolean;
  importModalLoading: boolean;
  importProjectId: number;
  currentProjectId: number;
  importProjectOptions: Array<{ label: string; value: number }>;
  selectedImportInterfaceCount: number;
  importTableRows: ImportInterfaceRow[];
  importTableLoading: boolean;
  importSelectedRowKeys: Array<string | number>;
  onImportProjectChange: (value: number) => void;
  onImportSelectedRowKeysChange: (keys: Array<string | number>) => void;
  onCancelImportModal: () => void;
  onConfirmImportInterfaces: () => void;
  methodClassName: (method?: string) => string;
  addCaseOpen: boolean;
  addCaseForm: FormInstance<AddCaseFormValues>;
  addCaseLoading: boolean;
  caseInterfaceTruncated: boolean;
  caseInterfaceOptions: Array<{ value: number; label: string; title?: string; path?: string }>;
  onCancelAddCase: () => void;
  onSubmitAddCase: (values: AddCaseFormValues) => void;
  commonSettingOpen: boolean;
  commonSettingForm: FormInstance<CommonSettingFormValues>;
  commonSettingLoading: boolean;
  onCancelCommonSetting: () => void;
  onSaveCommonSetting: () => void;
};

export function CollectionModals(props: CollectionModalsProps) {
  return (
    <>
      <Modal
        title={props.colModalType === 'add' ? '添加测试集合' : '编辑测试集合'}
        open={props.colModalOpen}
        onCancel={props.onCancelColModal}
        onOk={() => {
          void props.colForm.submit();
        }}
        confirmLoading={props.colModalLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<ColFormValues> form={props.colForm} layout="vertical" onFinish={values => void props.onSubmitCol(values)}>
          <Form.Item label="集合名" name="name" rules={[{ required: true, message: '请输入集合命名！' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="简介" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导入接口到集合"
        open={props.importModalOpen}
        width={900}
        onCancel={props.onCancelImportModal}
        onOk={props.onConfirmImportInterfaces}
        okText="确认"
        cancelText="取消"
        confirmLoading={props.importModalLoading}
        className="legacy-collection-import-modal"
      >
        <Space direction="vertical" className="legacy-collection-modal-stack" size={12}>
          <Space className="legacy-collection-import-project">
            <Text>选择要导入的项目：</Text>
            <Select<number>
              value={props.importProjectId > 0 ? props.importProjectId : props.currentProjectId}
              className="legacy-collection-import-project-select"
              options={props.importProjectOptions}
              onChange={props.onImportProjectChange}
            />
          </Space>
          <div className="legacy-collection-import-summary">
            <Alert
              type="info"
              showIcon
              className="legacy-collection-import-summary-alert"
              message={`已选择 ${props.selectedImportInterfaceCount} 个接口`}
            />
            <Button
              size="small"
              onClick={() => props.onImportSelectedRowKeysChange([])}
              disabled={props.importSelectedRowKeys.length === 0}
            >
              清空选择
            </Button>
          </div>
          <Table<ImportInterfaceRow>
            className="legacy-collection-import-table"
            rowKey="key"
            size="small"
            pagination={false}
            loading={props.importTableLoading}
            dataSource={props.importTableRows}
            defaultExpandAllRows
            rowClassName={row => (row.isCategory ? 'legacy-collection-import-category-row' : '')}
            locale={{ emptyText: '当前项目暂无可导入接口' }}
            rowSelection={{
              selectedRowKeys: props.importSelectedRowKeys,
              checkStrictly: false,
              onChange: selectedKeys => {
                props.onImportSelectedRowKeysChange(selectedKeys as Array<string | number>);
              }
            }}
            columns={[
              {
                title: '接口名称',
                dataIndex: 'title',
                render: (value: string, row) =>
                  row.isCategory ? <Text strong>{value}</Text> : <span>{value}</span>
              },
              {
                title: '接口路径',
                dataIndex: 'path',
                render: value => (value || '-')
              },
              {
                title: '请求方法',
                dataIndex: 'method',
                width: 120,
                render: (value: string, row) => {
                  if (row.isCategory) return '-';
                  const method = normalizeHttpMethod(value || 'GET');
                  return (
                    <span className={props.methodClassName(method)}>
                      {method}
                    </span>
                  );
                }
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: string, row) => {
                  if (row.isCategory) return '-';
                  return value === 'done' ? (
                    <span className="legacy-status-tag done">已完成</span>
                  ) : (
                    <span className="legacy-status-tag undone">未完成</span>
                  );
                }
              }
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="添加测试用例"
        open={props.addCaseOpen}
        onCancel={props.onCancelAddCase}
        onOk={() => {
          void props.addCaseForm.submit();
        }}
        okText="确认"
        cancelText="取消"
        confirmLoading={props.addCaseLoading}
      >
        <Form<AddCaseFormValues> form={props.addCaseForm} layout="vertical" onFinish={values => void props.onSubmitAddCase(values)}>
          {props.caseInterfaceTruncated ? (
            <Alert
              type="warning"
              showIcon
              className="legacy-collection-case-truncated-alert"
              message={`接口选项仅展示前 ${props.caseInterfaceOptions.length} 条，请通过左侧筛选或搜索后再添加。`}
            />
          ) : null}
          <Form.Item label="接口" name="interface_id" rules={[{ required: true, message: '请选择接口' }]}>
            <Select
              showSearch
              className="legacy-collection-case-interface-select"
              placeholder="搜索接口名称或路径"
              options={props.caseInterfaceOptions}
              optionFilterProp="label"
              filterOption={(input, option) => {
                const keyword = String(input || '').toLowerCase();
                const labelText = String(option?.label || '').toLowerCase();
                const titleText = String((option as { title?: string } | undefined)?.title || '').toLowerCase();
                const pathText = String((option as { path?: string } | undefined)?.path || '').toLowerCase();
                return labelText.includes(keyword) || titleText.includes(keyword) || pathText.includes(keyword);
              }}
            />
          </Form.Item>
          <Form.Item label="用例名称" name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input placeholder="例如：登录成功用例" />
          </Form.Item>
          <Form.Item label="测试环境" name="case_env">
            <Input placeholder="例如：dev" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="通用规则配置"
        open={props.commonSettingOpen}
        width={900}
        onCancel={props.onCancelCommonSetting}
        onOk={props.onSaveCommonSetting}
        okText="保存"
        cancelText="取消"
        confirmLoading={props.commonSettingLoading}
        className="legacy-collection-common-setting-modal"
      >
        <Form<CommonSettingFormValues> form={props.commonSettingForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            className="legacy-collection-common-setting-alert"
            message="执行顺序：先通用规则，再用例脚本。建议先配置字段校验，再补充脚本断言。"
          />
          <Form.Item
            label="检查 Http Code = 200"
            name="checkHttpCodeIs200"
            valuePropName="checked"
            tooltip="启用后，非 200 状态码将直接判定失败"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            label="检查返回 JSON 字段"
            tooltip="例如检查 code 是否等于 0"
            className="legacy-collection-inline-setting-row"
          >
            <Space wrap className="legacy-collection-inline-setting-fields">
              <Form.Item name="checkResponseFieldEnable" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item name="checkResponseFieldName" noStyle className="legacy-collection-inline-field">
                <Input className="legacy-collection-inline-input" placeholder="字段名，如 code" />
              </Form.Item>
              <Form.Item name="checkResponseFieldValue" noStyle className="legacy-collection-inline-field">
                <Input className="legacy-collection-inline-input" placeholder="期望值，如 0" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item
            label="检查返回数据结构(response schema)"
            name="checkResponseSchema"
            valuePropName="checked"
            tooltip="仅在接口 response 定义为 JSON Schema 时生效"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            label="全局测试脚本"
            tooltip="启用后每个 case 会先执行全局脚本，再执行 case 脚本"
            className="legacy-collection-inline-setting-row"
          >
            <Space wrap className="legacy-collection-script-switch-row">
              <Form.Item name="checkScriptEnable" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <span>启用脚本</span>
            </Space>
            <Form.Item name="checkScriptContent" noStyle>
              <Input.TextArea rows={10} placeholder="输入全局测试脚本" />
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
