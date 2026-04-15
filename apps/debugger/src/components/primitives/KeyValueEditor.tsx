import { ActionIcon, Button, Checkbox, Group, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { emptyParameterRow, type ParameterRow } from '@yapi-debugger/schema';

export function KeyValueEditor(props: {
  rows: ParameterRow[];
  onChange: (rows: ParameterRow[]) => void;
  nameLabel?: string;
  valueLabel?: string;
}) {
  const rows = props.rows.length > 0 ? props.rows : [emptyParameterRow()];

  return (
    <div className="key-value-editor">
      <div className="kv-head">
        <span>{props.nameLabel || 'Name'}</span>
        <span>{props.valueLabel || 'Value'}</span>
        <span>启用</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div className="kv-row" key={`${row.name}-${index}`}>
          <TextInput
            size="xs"
            value={row.name}
            placeholder="Authorization"
            onChange={event => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, name: event.currentTarget.value };
              props.onChange(nextRows);
            }}
          />
          <TextInput
            size="xs"
            value={row.value}
            placeholder="value"
            onChange={event => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, value: event.currentTarget.value };
              props.onChange(nextRows);
            }}
          />
          <Checkbox
            checked={row.enabled}
            onChange={event => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, enabled: event.currentTarget.checked };
              props.onChange(nextRows);
            }}
          />
          <ActionIcon
            variant="subtle"
            color="dark"
            radius="md"
            onClick={() => {
              props.onChange(rows.filter((_, currentIndex) => currentIndex !== index));
            }}
          >
            <IconTrash size={15} />
          </ActionIcon>
        </div>
      ))}
      <Group justify="space-between">
        <Button
          size="xs"
          variant="light"
          color="dark"
          leftSection={<IconPlus size={15} />}
          onClick={() => props.onChange([...rows, emptyParameterRow()])}
        >
          添加一行
        </Button>
      </Group>
    </div>
  );
}
