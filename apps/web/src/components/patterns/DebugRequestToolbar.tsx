import { Button, Select, TextInput } from '@mantine/core';

type DebugMethodOption = {
  value: string;
  label: string;
};

type DebugRequestToolbarProps = {
  methodValue: string;
  methodOptions: DebugMethodOption[];
  pathValue: string;
  pathPlaceholder?: string;
  runLabel?: string;
  runLoading?: boolean;
  onMethodChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onRun: () => void;
  clearAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  className?: string;
  methodClassName?: string;
  pathClassName?: string;
};

export function DebugRequestToolbar(props: DebugRequestToolbarProps) {
  return (
    <div className={['debug-request-toolbar', props.className].filter(Boolean).join(' ')}>
      <Select
        value={props.methodValue}
        onChange={value => props.onMethodChange(value || props.methodValue)}
        className={['debug-request-method-select', props.methodClassName].filter(Boolean).join(' ')}
        data={props.methodOptions}
      />
      <TextInput
        value={props.pathValue}
        onChange={event => props.onPathChange(event.currentTarget.value)}
        className={['debug-request-path-input', props.pathClassName].filter(Boolean).join(' ')}
        placeholder={props.pathPlaceholder || '/api/example'}
      />
      <Button loading={props.runLoading} onClick={props.onRun}>
        {props.runLabel || '发送请求'}
      </Button>
      {props.clearAction ? (
        <Button variant="default" onClick={props.clearAction.onClick} disabled={props.clearAction.disabled}>
          {props.clearAction.label}
        </Button>
      ) : null}
    </div>
  );
}
