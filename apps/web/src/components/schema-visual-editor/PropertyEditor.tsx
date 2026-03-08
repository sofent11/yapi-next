import { TextInput } from '@mantine/core';

type PropertyEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PropertyEditor({ value, onChange, placeholder }: PropertyEditorProps) {
  return (
    <TextInput
      value={value}
      onChange={event => onChange(event.currentTarget.value)}
      placeholder={placeholder || '备注'}
      aria-label="字段说明"
    />
  );
}
