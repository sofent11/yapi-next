import { Badge, Button, Group, Select, Text, TextInput } from '@mantine/core';
import { IconDeviceFloppy, IconSearch } from '@tabler/icons-react';
import type { SendRequestResult } from '@yapi-debugger/schema';

interface ResponseHeaderProps {
  response: SendRequestResult | null;
  requestError: string | null;
  sourceLabel: string;
  mimeType: string;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchNavigate: (direction: 'next' | 'previous') => void;
  surfacedMatches?: number;
  selectedExampleName: string | null;
  examples: Array<{ name: string; role: string }>;
  onSelectExample: (name: string | null) => void;
  onSaveAsCase: () => void;
  exampleOptionLabel: (name: string, role: string) => string;
}

export function ResponseHeader({
  response,
  requestError,
  sourceLabel,
  mimeType,
  searchText,
  onSearchChange,
  onSearchNavigate,
  surfacedMatches,
  selectedExampleName,
  examples,
  onSelectExample,
  onSaveAsCase,
  exampleOptionLabel
}: ResponseHeaderProps) {
  return (
    <div className="response-header-ide">
      <div className="response-status-group">
        <div className="response-status-copy">
          <Text size="xs" c="dimmed" fw={500}>
            {response ? (mimeType || 'binary') : sourceLabel}
            {searchText ? ` · ${surfacedMatches || 0} matches` : ''}
          </Text>
        </div>
        {response ? (
          <div className="response-metrics">
            <Badge color={response.ok ? 'green' : 'red'} variant="light" size="sm">
              {response.status}
            </Badge>
            <Text size="xs" fw={600} c="dimmed">{response.durationMs}ms</Text>
            <Text size="xs" fw={600} c="dimmed">{response.sizeBytes}B</Text>
          </div>
        ) : requestError ? (
          <Badge color="red" variant="filled" size="xs">Failed</Badge>
        ) : null}
      </div>
      <Group gap="xs" wrap="wrap" className="response-header-actions">
        <div className="response-toolbar-primary">
          <TextInput
            size="xs"
            className="response-search-input"
            leftSection={<IconSearch size={14} />}
            placeholder="搜索 body / JSON / header / cookie"
            value={searchText}
            onChange={event => onSearchChange(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                onSearchNavigate(event.shiftKey ? 'previous' : 'next');
              }
            }}
          />
          <Select
            size="xs"
            className="response-example-select"
            placeholder="查看实时响应"
            value={selectedExampleName || '__live__'}
            data={[
              { value: '__live__', label: '实时响应' },
              ...examples.map(example => ({ value: example.name, label: exampleOptionLabel(example.name, example.role) }))
            ]}
            onChange={value => onSelectExample(value === '__live__' ? null : value)}
          />
          <Button size="xs" variant="default" leftSection={<IconDeviceFloppy size={14} />} onClick={onSaveAsCase}>
            另存为用例
          </Button>
        </div>
      </Group>
    </div>
  );
}
