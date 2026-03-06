import { Input } from 'antd';

type MockGeneratorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MockGenerator({ value, onChange }: MockGeneratorProps) {
  return (
    <Input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder="mock"
    />
  );
}
