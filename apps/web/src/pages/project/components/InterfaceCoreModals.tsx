import { Form, Input, Modal, Select, Space, Typography } from 'antd';
import { legacyNameValidator } from '../../../utils/legacy-validation';

const { Text } = Typography;

type InterfaceCoreModalsProps = {
  confirmOpen: boolean;
  onCancelConfirm: () => void;
  onConfirmLeave: () => void;
  addInterfaceOpen: boolean;
  addInterfaceForm: any;
  addInterfaceLoading: boolean;
  runMethods: readonly string[];
  catRows: Array<{ _id?: number; name?: string }>;
  onCancelAddInterface: () => void;
  onSubmitAddInterface: (values: { title: string; path: string; method: string; catid: number }) => void;
  tagSettingOpen: boolean;
  tagSettingInput: string;
  tagSettingLoading: boolean;
  onTagSettingInputChange: (value: string) => void;
  onCancelTagSetting: () => void;
  onSaveTagSetting: () => void;
  bulkOpen: boolean;
  bulkValue: string;
  onBulkValueChange: (value: string) => void;
  onCancelBulk: () => void;
  onConfirmBulk: () => void;
  addCatOpen: boolean;
  addCatForm: any;
  addCatLoading: boolean;
  onCancelAddCat: () => void;
  onSubmitAddCat: (values: { name: string; desc?: string }) => void;
  editCatOpen: boolean;
  editCatForm: any;
  editCatLoading: boolean;
  onCancelEditCat: () => void;
  onSubmitEditCat: (values: { name: string; desc?: string }) => void;
};

export function InterfaceCoreModals(props: InterfaceCoreModalsProps) {
  return (
    <>
      <Modal
        title="你即将离开编辑页面"
        open={props.confirmOpen}
        onCancel={props.onCancelConfirm}
        onOk={props.onConfirmLeave}
      >
        <p>离开页面会丢失当前编辑的内容，确定要离开吗？</p>
      </Modal>

      <Modal
        title="新增接口"
        open={props.addInterfaceOpen}
        onCancel={props.onCancelAddInterface}
        onOk={() => {
          void props.addInterfaceForm.submit();
        }}
        confirmLoading={props.addInterfaceLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<any>
          form={props.addInterfaceForm}
          layout="vertical"
          onFinish={values => void props.onSubmitAddInterface(values)}
        >
          <Form.Item
            label="接口名称"
            name="title"
            rules={[{ required: true, validator: legacyNameValidator('接口') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="路径" name="path" rules={[{ required: true, message: '请输入接口路径' }]}>
            <Input placeholder="/api/example" />
          </Form.Item>
          <Form.Item label="Method" name="method" rules={[{ required: true, message: '请选择 Method' }]}>
            <Select options={props.runMethods.map(item => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item label="分类" name="catid" rules={[{ required: true, message: '请选择分类' }]}>
            <Select
              options={props.catRows.map(item => ({
                label: item.name,
                value: Number(item._id || 0)
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tag 设置"
        open={props.tagSettingOpen}
        onCancel={props.onCancelTagSetting}
        onOk={props.onSaveTagSetting}
        confirmLoading={props.tagSettingLoading}
        okText="保存"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">每行一个 Tag 名称，保存后会更新当前项目 Tag 列表。</Text>
          <Input.TextArea
            rows={8}
            value={props.tagSettingInput}
            onChange={event => props.onTagSettingInputChange(event.target.value)}
            placeholder={'example-tag\nbeta\ninternal'}
          />
        </Space>
      </Modal>

      <Modal
        title="批量添加参数"
        open={props.bulkOpen}
        onCancel={props.onCancelBulk}
        onOk={props.onConfirmBulk}
        okText="导入"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">每行一个 `name:example`，例如 `id:1`。</Text>
          <Input.TextArea
            rows={10}
            value={props.bulkValue}
            onChange={event => props.onBulkValueChange(event.target.value)}
            placeholder="name:example"
          />
        </Space>
      </Modal>

      <Modal
        title="新增分类"
        open={props.addCatOpen}
        onCancel={props.onCancelAddCat}
        onOk={() => {
          void props.addCatForm.submit();
        }}
        confirmLoading={props.addCatLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<any>
          form={props.addCatForm}
          layout="vertical"
          onFinish={values => void props.onSubmitAddCat(values)}
        >
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑分类"
        open={props.editCatOpen}
        onCancel={props.onCancelEditCat}
        onOk={() => {
          void props.editCatForm.submit();
        }}
        confirmLoading={props.editCatLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<any>
          form={props.editCatForm}
          layout="vertical"
          onFinish={values => void props.onSubmitEditCat(values)}
        >
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
