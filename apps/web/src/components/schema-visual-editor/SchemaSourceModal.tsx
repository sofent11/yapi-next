import { Button, Group, Modal, Textarea } from '@mantine/core';

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
      opened={open}
      onClose={onCancel}
      size="xl"
    >
      <Textarea minRows={20} autosize value={draft} onChange={event => onChange(event.currentTarget.value)} />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button onClick={onSave}>应用</Button>
      </Group>
    </Modal>
  );
}
