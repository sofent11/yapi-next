import { Button, Group, Modal, Text, Textarea } from '@mantine/core';

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
      opened={open}
      onClose={onCancel}
      size="xl"
    >
      <Text c="dimmed" mb="sm">粘贴正常 JSON（示例数据），将自动转换为 JSON Schema。</Text>
      <Textarea
        minRows={14}
        autosize
        className="legacy-schema-editor-import-input"
        value={draft}
        onChange={event => onChange(event.currentTarget.value)}
        placeholder={'{\n  "code": 0,\n  "message": "ok",\n  "data": { "records": [] }\n}'}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>取消</Button>
        <Button onClick={onSave}>生成并应用</Button>
      </Group>
    </Modal>
  );
}
