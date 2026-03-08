import { Select } from '@mantine/core';
import { FIELD_TYPES } from '../SchemaVisualEditor.utils';
import type { SchemaFieldType } from '../SchemaVisualEditor.types';

type TypeSelectorProps = {
  value: SchemaFieldType;
  onChange: (value: SchemaFieldType) => void;
};

export function TypeSelector({ value, onChange }: TypeSelectorProps) {
  return (
    <Select
      value={value}
      className="workspace-control"
      data={FIELD_TYPES}
      onChange={nextValue => onChange((nextValue as SchemaFieldType) || 'string')}
      aria-label="字段类型"
    />
  );
}
