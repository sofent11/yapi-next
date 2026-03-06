import { Input } from 'antd';

type PropertyEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PropertyEditor({ value, onChange, placeholder }: PropertyEditorProps) {
  return (
    <Input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder || '备注'}
    />
  );
}
