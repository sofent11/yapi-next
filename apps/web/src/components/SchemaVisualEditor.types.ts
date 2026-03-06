export type SchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export type SchemaFieldRow = {
  id: string;
  parentId: string;
  depth: number;
  name: string;
  type: SchemaFieldType;
  required: boolean;
  description: string;
  defaultValue: string;
  mockValue: string;
  isArrayItem: boolean;
};

export type SchemaVisualEditorProps = {
  value?: string;
  onChange: (nextValue: string) => void;
};
