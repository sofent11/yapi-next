import { Modal, Input } from 'antd';

type Props = {
  open: boolean;
  draft: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function FieldSchemaModal({ open, draft, onChange, onCancel, onSave }: Props) {
  return (
    <Modal
      title="字段 Schema"
      open={open}
      onCancel={onCancel}
      onOk={onSave}
      width={720}
      okText="应用"
    >
      <Input.TextArea rows={16} value={draft} onChange={event => onChange(event.target.value)} />
    </Modal>
  );
}
