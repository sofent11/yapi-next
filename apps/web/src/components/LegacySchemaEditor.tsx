import { useMemo } from 'react';
import { Alert } from '@mantine/core';
import json5 from 'json5';
import { SchemaVisualEditor } from './SchemaVisualEditor';

const DRAFT4_SCHEMA_URI = 'http://json-schema.org/draft-04/schema#';

type LegacySchemaEditorProps = {
  value?: string;
  onChange: (nextValue: string) => void;
};

function normalizeSchemaText(input?: string): { text: string; valid: boolean } {
  const raw = String(input || '').trim();
  if (!raw) {
    return {
      text: JSON.stringify({ $schema: DRAFT4_SCHEMA_URI, type: 'object', properties: {} }, null, 2),
      valid: true
    };
  }
  try {
    const parsed = json5.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('schema 必须是 object');
    }
    if (parsed.properties && typeof parsed.properties === 'object' && !parsed.type) {
      parsed.type = 'object';
    }
    if (parsed.items && typeof parsed.items === 'object' && !parsed.type) {
      parsed.type = 'array';
    }
    if (!parsed.type) {
      throw new Error('schema 缺少 type');
    }
    if (!parsed.$schema) {
      parsed.$schema = DRAFT4_SCHEMA_URI;
    }
    return { text: JSON.stringify(parsed, null, 2), valid: true };
  } catch (_err) {
    return { text: raw, valid: false };
  }
}

export function LegacySchemaEditor(props: LegacySchemaEditorProps) {
  const normalized = useMemo(() => normalizeSchemaText(props.value), [props.value]);

  if (!normalized.valid) {
    return (
      <>
        <Alert
          color="yellow"
          className="legacy-schema-editor-alert mb-4"
          title="当前 schema 文本格式有误，已暂不启用可视化编辑。修正后会自动同步。"
        />
        <SchemaVisualEditor value={normalized.text} onChange={props.onChange} />
      </>
    );
  }

  return (
    <SchemaVisualEditor value={normalized.text} onChange={props.onChange} />
  );
}
