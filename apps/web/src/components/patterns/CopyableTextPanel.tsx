import { Button, Text, Textarea } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';

type CopyableTextPanelProps = {
  title: string;
  value: string;
  onCopy: () => void;
  rows?: number;
  placeholder?: string;
  monospace?: boolean;
};

export function CopyableTextPanel(props: CopyableTextPanelProps) {
  return (
    <div className="copyable-text-panel">
      <div className="copyable-text-panel-head">
        <Text fw={600}>{props.title}</Text>
        <Button size="xs" variant="default" leftSection={<IconCopy size={14} />} onClick={props.onCopy}>
          复制
        </Button>
      </div>
      <Textarea
        minRows={props.rows || 6}
        readOnly
        value={props.value}
        placeholder={props.placeholder}
        className={props.monospace ? 'copyable-text-panel-mono' : undefined}
      />
    </div>
  );
}
