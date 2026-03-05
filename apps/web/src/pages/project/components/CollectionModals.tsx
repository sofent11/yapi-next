import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Typography } from 'antd';
import type { CSSProperties } from 'react';

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

type CollectionModalsProps = {
  colModalType: 'add' | 'edit';
  colModalOpen: boolean;
  colForm: any;
  colModalLoading: boolean;
  onCancelColModal: () => void;
  onSubmitCol: (values: { name: string; desc?: string }) => void;
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
  methodStyle: (method?: string) => CSSProperties;
  addCaseOpen: boolean;
  addCaseForm: any;
  addCaseLoading: boolean;
  caseInterfaceTruncated: boolean;
  caseInterfaceOptions: Array<{ value: number; label: string; title?: string; path?: string }>;
  onCancelAddCase: () => void;
  onSubmitAddCase: (values: { interface_id: number; casename: string; case_env?: string }) => void;
  commonSettingOpen: boolean;
  commonSettingForm: any;
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
        <Form<any> form={props.colForm} layout="vertical" onFinish={values => void props.onSubmitCol(values)}>
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
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Text>选择要导入的项目：</Text>
            <Select<number>
              value={props.importProjectId > 0 ? props.importProjectId : props.currentProjectId}
              style={{ width: 260 }}
              options={props.importProjectOptions}
              onChange={props.onImportProjectChange}
            />
          </Space>
          <Alert
            type="info"
            showIcon
            message={`已选择 ${props.selectedImportInterfaceCount} 个接口`}
          />
          <Table<ImportInterfaceRow>
            rowKey="key"
            size="small"
            pagination={false}
            loading={props.importTableLoading}
            dataSource={props.importTableRows}
            defaultExpandAllRows
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
                render: (value: string, row) =>
                  row.isCategory ? '-' : (
                    <span className="legacy-method-pill" style={props.methodStyle(value || 'GET')}>
                      {value || 'GET'}
                    </span>
                  )
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
        <Form<any> form={props.addCaseForm} layout="vertical" onFinish={values => void props.onSubmitAddCase(values)}>
          {props.caseInterfaceTruncated ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`接口选项仅展示前 ${props.caseInterfaceOptions.length} 条，请通过左侧筛选或搜索后再添加。`}
            />
          ) : null}
          <Form.Item label="接口" name="interface_id" rules={[{ required: true, message: '请选择接口' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={props.caseInterfaceOptions}
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
      >
        <Form<any> form={props.commonSettingForm} layout="vertical">
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
            style={{ marginBottom: 8 }}
          >
            <Space wrap>
              <Form.Item name="checkResponseFieldEnable" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item name="checkResponseFieldName" noStyle>
                <Input style={{ width: 180 }} placeholder="字段名，如 code" />
              </Form.Item>
              <Form.Item name="checkResponseFieldValue" noStyle>
                <Input style={{ width: 180 }} placeholder="期望值，如 0" />
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
            style={{ marginBottom: 8 }}
          >
            <Space wrap style={{ marginBottom: 8 }}>
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
