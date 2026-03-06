import { Select } from 'antd';
import { FIELD_TYPES } from '../SchemaVisualEditor.utils';
import type { SchemaFieldType } from '../SchemaVisualEditor.types';

type TypeSelectorProps = {
  value: SchemaFieldType;
  onChange: (value: SchemaFieldType) => void;
};

export function TypeSelector({ value, onChange }: TypeSelectorProps) {
  return (
    <Select<SchemaFieldType>
      value={value}
      className="legacy-workspace-control"
      options={FIELD_TYPES}
      onChange={onChange}
    />
  );
}
