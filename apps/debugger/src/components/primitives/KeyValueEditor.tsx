import { ActionIcon, Button, Checkbox, TextInput } from '@mantine/core';
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
        <div>{props.nameLabel || 'Key'}</div>
        <div>{props.valueLabel || 'Value'}</div>
        <div style={{ textAlign: 'center' }}>Enabled</div>
        <div />
      </div>
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          <div>
            <TextInput
              size="xs"
              value={row.name}
              placeholder="Key"
              onChange={event => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, name: event.currentTarget.value };
                props.onChange(nextRows);
              }}
              variant="unstyled"
            />
          </div>
          <div>
            <TextInput
              size="xs"
              value={row.value}
              placeholder="Value"
              onChange={event => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, value: event.currentTarget.value };
                props.onChange(nextRows);
              }}
              variant="unstyled"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Checkbox
              size="xs"
              checked={row.enabled}
              onChange={event => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, enabled: event.currentTarget.checked };
                props.onChange(nextRows);
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => {
                props.onChange(rows.filter((_, currentIndex) => currentIndex !== index));
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </div>
        </div>
      ))}
      <div style={{ padding: '8px' }}>
        <Button
          size="xs"
          variant="subtle"
          color="indigo"
          leftSection={<IconPlus size={14} />}
          onClick={() => props.onChange([...rows, emptyParameterRow()])}
        >
          Add Row
        </Button>
      </div>
    </div>
  );
}
