import { Button, Select, TextInput } from '@mantine/core';
import { IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import type { RequestDocument } from '@yapi-debugger/schema';

interface RequestUrlBarProps {
  kind: RequestDocument['kind'];
  method: RequestDocument['method'];
  url: string;
  isRunning: boolean;
  canSave: boolean;
  onSave?: () => void;
  onRun: () => void;
  onUrlChange: (url: string) => void;
  onKindChange: (kind: RequestDocument['kind']) => void;
  onMethodChange: (method: RequestDocument['method']) => void;
  onPaste: (text: string) => boolean;
}

const REQUEST_METHODS: RequestDocument['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REQUEST_KINDS: RequestDocument['kind'][] = ['http', 'graphql', 'grpc', 'websocket', 'script'];

export function RequestUrlBar({
  kind,
  method,
  url,
  isRunning,
  canSave,
  onSave,
  onRun,
  onUrlChange,
  onKindChange,
  onMethodChange,
  onPaste
}: RequestUrlBarProps) {
  return (
    <div className="method-url-group">
      <Select
        size="sm"
        className="request-kind-select-ide"
        value={kind}
        data={REQUEST_KINDS.map(k => ({ value: k, label: k.toUpperCase() }))}
        onChange={value => onKindChange((value as RequestDocument['kind']) || 'http')}
        variant="filled"
      />
      <Select
        size="sm"
        className="method-select-ide"
        value={method}
        data={REQUEST_METHODS.map(m => ({ value: m, label: m }))}
        onChange={value => onMethodChange(value as RequestDocument['method'])}
        disabled={kind === 'grpc'}
        variant="filled"
      />
      <TextInput
        size="sm"
        className="url-input-ide"
        value={url}
        placeholder="输入请求地址，支持直接粘贴 cURL"
        onChange={event => onUrlChange(event.currentTarget.value)}
        onPaste={event => {
          const pastedText = event.clipboardData.getData('text');
          if (pastedText && onPaste(pastedText)) {
            event.preventDefault();
          }
        }}
        variant="filled"
      />
      {canSave && onSave ? (
        <Button size="sm" variant="default" leftSection={<IconDeviceFloppy size={14} />} onClick={onSave}>
          保存
        </Button>
      ) : null}
      <Button size="sm" variant="filled" leftSection={<IconPlayerPlay size={14} />} loading={isRunning} onClick={onRun}>
        {kind === 'script' ? '运行脚本' : '发送请求'}
      </Button>
    </div>
  );
}
