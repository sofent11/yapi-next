import CodeMirror from '@uiw/react-codemirror';
import { jsonLanguage } from '@codemirror/lang-json';
import { yamlLanguage } from '@codemirror/lang-yaml';

export function CodeEditor(props: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: 'json' | 'yaml' | 'text';
  minHeight?: string;
}) {
  const extensions =
    props.language === 'yaml' ? [yamlLanguage] : props.language === 'json' ? [jsonLanguage] : [];

  return (
    <div className="code-editor-shell">
      <CodeMirror
        value={props.value}
        readOnly={props.readOnly}
        height={props.minHeight || '180px'}
        extensions={extensions}
        onChange={value => props.onChange?.(value)}
        theme="light"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false
        }}
      />
    </div>
  );
}
