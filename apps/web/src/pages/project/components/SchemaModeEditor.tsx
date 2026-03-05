import { Suspense, lazy } from 'react';
import type { CSSProperties } from 'react';
import { Form, Input, Radio, Space, Typography } from 'antd';

const { Text } = Typography;
const LazyLegacySchemaEditor = lazy(() =>
  import('../../../components/LegacySchemaEditor').then(mod => ({ default: mod.LegacySchemaEditor }))
);

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
  return (
    <>
      <Space className="legacy-schema-mode-toolbar">
        <Text strong>编辑模式</Text>
        <Radio.Group
          size="small"
          value={props.mode}
          onChange={event => props.onModeChange(event.target.value)}
        >
          <Radio.Button value="visual">可视化</Radio.Button>
          <Radio.Button value="text">文本</Radio.Button>
        </Radio.Group>
      </Space>
      {props.mode === 'visual' ? (
        <>
          <Form.Item name={props.fieldName} hidden style={props.hiddenFormItemStyle}>
            <Input.TextArea />
          </Form.Item>
          <Suspense fallback={<div>加载 schema 编辑器中...</div>}>
            <LazyLegacySchemaEditor value={props.value} onChange={props.onValueChange} />
          </Suspense>
        </>
      ) : (
        <Form.Item label={props.textLabel} name={props.fieldName} style={props.textFormItemStyle}>
          <Input.TextArea rows={props.textRows || 12} placeholder={props.textPlaceholder} />
        </Form.Item>
      )}
    </>
  );
}
