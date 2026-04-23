export type SchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null' | 'ref';
export type SchemaAdditionalPropertiesMode = 'none' | 'closed' | 'any' | 'schema';

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
  isAdditionalProperty: boolean;
  refName: string;
  additionalPropertiesMode: SchemaAdditionalPropertiesMode;
};

export type SchemaDefinitionDraft = {
  name: string;
  schemaText: string;
};

export type SchemaVisualEditorProps = {
  value?: string;
  onChange: (nextValue: string) => void;
};
