import { Button, Group, Modal, Textarea } from '@mantine/core';

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
      opened={open}
      onClose={onCancel}
      size="lg"
    >
      <Textarea minRows={16} autosize value={draft} onChange={event => onChange(event.currentTarget.value)} />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button onClick={onSave}>应用</Button>
      </Group>
    </Modal>
  );
}
