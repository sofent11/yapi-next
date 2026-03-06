import { TextInput } from '@mantine/core';

type MockGeneratorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MockGenerator({ value, onChange }: MockGeneratorProps) {
  return (
    <TextInput
      value={value}
      onChange={event => onChange(event.currentTarget.value)}
      placeholder="mock"
    />
  );
}
