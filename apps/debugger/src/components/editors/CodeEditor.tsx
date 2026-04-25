import { useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { jsonLanguage } from '@codemirror/lang-json';
import { SearchQuery, findNext, search, setSearchQuery } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { yamlLanguage } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useComputedColorScheme } from '@mantine/core';

export function CodeEditor(props: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: 'json' | 'yaml' | 'text';
  minHeight?: string;
  searchQuery?: string;
  onCreateEditor?: (view: EditorView) => void;
}) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const editorViewRef = useRef<EditorView | null>(null);
  const lastSearchQueryRef = useRef('');
  const extensions = useMemo(() => {
    const nextExtensions: Extension[] = [search({ top: false })];
    if (props.language === 'yaml') nextExtensions.unshift(yamlLanguage);
    if (props.language === 'json') nextExtensions.unshift(jsonLanguage);
    return nextExtensions;
  }, [props.language]);

  useEffect(() => {
    const editorView = editorViewRef.current;
    if (!editorView) return;
    const searchQuery = props.searchQuery?.trim() || '';
    editorView.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: searchQuery, caseSensitive: false, literal: true }))
    });
    if (searchQuery && searchQuery !== lastSearchQueryRef.current) {
      findNext(editorView);
    }
    lastSearchQueryRef.current = searchQuery;
  }, [props.searchQuery]);

  return (
    <div className="code-editor-shell">
      <CodeMirror
        value={props.value}
        readOnly={props.readOnly}
        height={props.minHeight || '180px'}
        extensions={extensions}
        onChange={value => props.onChange?.(value)}
        onCreateEditor={view => {
          editorViewRef.current = view;
          props.onCreateEditor?.(view);
        }}
        theme={colorScheme === 'dark' ? oneDark : 'light'}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false
        }}
      />
    </div>
  );
}
