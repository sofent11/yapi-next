import { Button, Text, Textarea } from '@mantine/core';
import { IconBrush, IconCopy, IconTrash } from '@tabler/icons-react';

type DebugEditorPanelProps = {
  title: string;
  value: string;
  onChange?: (value: string) => void;
  onFormat?: () => void;
  onCopy?: () => void;
  onClear?: () => void;
  disableCopy?: boolean;
  disableClear?: boolean;
  readOnly?: boolean;
  minRows?: number;
  autosize?: boolean;
  placeholder?: string;
  className?: string;
};

export function DebugEditorPanel(props: DebugEditorPanelProps) {
  return (
    <div className={['debug-editor-panel', props.className].filter(Boolean).join(' ')}>
      <div className="debug-editor-panel-head">
        <Text fw={700}>{props.title}</Text>
        <div className="debug-editor-panel-actions">
          {props.onFormat ? (
            <Button size="compact-sm" variant="default" leftSection={<IconBrush size={14} />} onClick={props.onFormat}>
              格式化
            </Button>
          ) : null}
          {props.onCopy ? (
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconCopy size={14} />}
              onClick={props.onCopy}
              disabled={props.disableCopy}
            >
              复制
            </Button>
          ) : null}
          {props.onClear ? (
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconTrash size={14} />}
              onClick={props.onClear}
              disabled={props.disableClear}
            >
              清空
            </Button>
          ) : null}
        </div>
      </div>
      <Textarea
        minRows={props.minRows || 6}
        autosize={props.autosize}
        value={props.value}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        onChange={event => props.onChange?.(event.currentTarget.value)}
      />
    </div>
  );
}
