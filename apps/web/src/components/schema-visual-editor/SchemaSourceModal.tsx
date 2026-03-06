import { Modal, Input } from 'antd';

type Props = {
  open: boolean;
  draft: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function SchemaSourceModal({ open, draft, onChange, onCancel, onSave }: Props) {
  return (
    <Modal
      title="Schema 文件编辑"
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      width={900}
      okText="应用"
    >
      <Input.TextArea rows={20} value={draft} onChange={event => onChange(event.target.value)} />
    </Modal>
  );
}
