import { ActionIcon, Button, Checkbox, Select, TextInput } from '@mantine/core';
import { IconFile, IconPlus, IconTrash } from '@tabler/icons-react';
import { emptyParameterRow, type ParameterRow } from '@yapi-debugger/schema';

export function KeyValueEditor(props: {
  rows: ParameterRow[];
  onChange: (rows: ParameterRow[]) => void;
  nameLabel?: string;
  valueLabel?: string;
  allowFileRows?: boolean;
  onPickFile?: (index: number) => void;
}) {
  const rows = props.rows.length > 0 ? props.rows : [emptyParameterRow()];

  return (
    <div className="key-value-editor">
      <div className="kv-head">
        <div>{props.nameLabel || 'Key'}</div>
        {props.allowFileRows ? <div>Type</div> : null}
        <div>{props.valueLabel || 'Value'}</div>
        <div style={{ textAlign: 'center' }}>Enabled</div>
        <div />
      </div>
      <div className="kv-body">
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
            {props.allowFileRows ? (
              <div>
                <Select
                  size="xs"
                  value={row.kind || 'text'}
                  data={[
                    { value: 'text', label: 'Text' },
                    { value: 'file', label: 'File' }
                  ]}
                  onChange={value => {
                    const nextRows = [...rows];
                    nextRows[index] = {
                      ...row,
                      kind: (value as ParameterRow['kind']) || 'text',
                      filePath: value === 'file' ? row.filePath || row.value || '' : undefined
                    };
                    props.onChange(nextRows);
                  }}
                />
              </div>
            ) : null}
            <div>
              <div className="kv-value-cell">
                <TextInput
                  size="xs"
                  value={row.kind === 'file' ? row.filePath || row.value || '' : row.value}
                  placeholder={row.kind === 'file' ? 'Choose file' : 'Value'}
                  onChange={event => {
                    const nextRows = [...rows];
                    nextRows[index] =
                      row.kind === 'file'
                        ? { ...row, filePath: event.currentTarget.value, value: event.currentTarget.value }
                        : { ...row, value: event.currentTarget.value };
                    props.onChange(nextRows);
                  }}
                  variant="unstyled"
                />
                {props.allowFileRows && row.kind === 'file' ? (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => props.onPickFile?.(index)}
                  >
                    <IconFile size={14} />
                  </ActionIcon>
                ) : null}
              </div>
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
      </div>
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
