import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Radio, Stack, Textarea, Text } from '@mantine/core';
import { Field } from 'rc-field-form';
import { SchemaEditor } from '../../../components/SchemaEditor';
import { schemaSupportsVisualEditor } from '../../../components/SchemaVisualEditor.utils';

type SchemaModeEditorProps = {
  mode: 'visual' | 'text';
  onModeChange: (mode: 'visual' | 'text') => void;
  fieldName: string;
  value: string;
  onValueChange: (value: string) => void;
  textLabel: string;
  textPlaceholder?: string;
  textRows?: number;
  hiddenFormItemStyle?: CSSProperties;
  textFormItemStyle?: CSSProperties;
};

export function SchemaModeEditor(props: SchemaModeEditorProps) {
  useEffect(() => {
    if (props.mode !== 'visual') {
      return;
    }
    const support = schemaSupportsVisualEditor(props.value);
    if (!support.supported) {
      props.onModeChange('text');
    }
  }, [props.mode, props.onModeChange, props.value]);

  return (
    <>
      <Stack gap="xs" className="schema-editor-mode-toolbar">
        <Text fw={600}>编辑模式</Text>
        {!schemaSupportsVisualEditor(props.value).supported ? (
          <Text size="sm" c="yellow">
            当前 schema 包含仅支持文本编辑的高级关键字，已切换为文本模式
          </Text>
        ) : null}
        <Radio.Group
          value={props.mode}
          onChange={value => props.onModeChange(value as 'visual' | 'text')}
        >
          <div className="flex flex-wrap gap-3">
            <Radio value="visual" label="可视化" />
            <Radio value="text" label="文本" />
          </div>
        </Radio.Group>
      </Stack>
      {props.mode === 'visual' ? (
        <>
          <Field name={props.fieldName}>
            {(control) => (
              <Textarea
                style={{ display: 'none', ...props.hiddenFormItemStyle }}
                value={String(control.value ?? '')}
                onChange={event => control.onChange(event.currentTarget.value)}
              />
            )}
          </Field>
          <SchemaEditor value={props.value} onChange={props.onValueChange} />
        </>
      ) : (
        <Field name={props.fieldName}>
          {(control) => (
            <Textarea
              label={props.textLabel}
              minRows={props.textRows || 12}
              style={props.textFormItemStyle}
              value={String(control.value ?? '')}
              onChange={event => control.onChange(event.currentTarget.value)}
              placeholder={props.textPlaceholder}
            />
          )}
        </Field>
      )}
    </>
  );
}
