import { Modal, Input, Typography } from 'antd';

const { Text } = Typography;

type Props = {
  open: boolean;
  draft: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function ImportJsonModal({ open, draft, onChange, onCancel, onSave }: Props) {
  return (
    <Modal
      title="导入 JSON 并生成 Schema"
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      width={760}
      okText="生成并应用"
    >
      <Text type="secondary">粘贴正常 JSON（示例数据），将自动转换为 JSON Schema。</Text>
      <Input.TextArea
        rows={14}
        className="legacy-schema-editor-import-input"
        value={draft}
        onChange={event => onChange(event.target.value)}
        placeholder={'{\n  "code": 0,\n  "message": "ok",\n  "data": { "records": [] }\n}'}
      />
    </Modal>
  );
}
