import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { findNext, findPrevious } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { Badge, Button, Group, Select, Tabs, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconBraces, IconCookie, IconDownload, IconEye, IconGitCompare, IconPlayerPlay, IconSearch } from '@tabler/icons-react';
import type {
  CheckResult,
  RequestDocument,
  ResolvedRequestPreview,
  ScriptLog,
  SendRequestResult,
  SessionSnapshot
} from '@yapi-debugger/schema';
import type { ResponseTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';

type GeneratedCheckInput =
  | { type: 'status-equals'; label: string; expected: string }
  | { type: 'header-equals' | 'header-includes'; label: string; path: string; expected: string }
  | { type: 'json-exists'; label: string; path: string }
  | { type: 'json-equals'; label: string; path: string; expected: string };

function responseHeadersText(res: SendRequestResult | null) {
  if (!res) return '';
  return res.headers.map(h => `${h.name}: ${h.value}`).join('\n');
}

function responseHeaderValue(response: SendRequestResult | null, name: string) {
  return response?.headers.find(header => header.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function responseMimeType(response: SendRequestResult | null, selectedExampleMimeType?: string) {
  return (selectedExampleMimeType || responseHeaderValue(response, 'content-type') || '').split(';')[0].trim().toLowerCase();
}

function responsePreviewKind(mimeType: string, parsedJson: unknown, bodyBase64?: string) {
  if (parsedJson != null || mimeType.includes('json')) return 'json';
  if (mimeType.includes('html')) return 'html';
  if (mimeType.startsWith('image/')) return bodyBase64 ? 'image' : 'binary';
  if (mimeType.startsWith('audio/')) return bodyBase64 ? 'audio' : 'binary';
  if (mimeType.startsWith('video/')) return bodyBase64 ? 'video' : 'binary';
  if (mimeType.includes('pdf')) return bodyBase64 ? 'pdf' : 'binary';
  if (mimeType.startsWith('text/') || mimeType.includes('xml') || mimeType.includes('javascript') || mimeType.includes('svg')) return 'text';
  return bodyBase64 ? 'binary' : 'text';
}

function mimeExtension(mimeType: string) {
  if (mimeType.includes('json')) return 'json';
  if (mimeType.includes('html')) return 'html';
  if (mimeType.includes('xml')) return 'xml';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1] || 'img';
  if (mimeType.startsWith('audio/')) return mimeType.split('/')[1] || 'audio';
  if (mimeType.startsWith('video/')) return mimeType.split('/')[1] || 'video';
  if (mimeType.startsWith('text/')) return 'txt';
  return 'bin';
}

function suggestedResponseFilename(url: string | undefined, mimeType: string) {
  const rawName = url?.split('?')[0].split('/').filter(Boolean).pop() || 'response';
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (safeName.includes('.')) return safeName;
  return `${safeName}.${mimeExtension(mimeType)}`;
}

function downloadResponsePayload(input: { bodyText: string; bodyBase64?: string; mimeType: string; url?: string }) {
  const blob =
    input.bodyBase64
      ? new Blob(
          [
            Uint8Array.from(window.atob(input.bodyBase64), char => char.charCodeAt(0))
          ],
          { type: input.mimeType || 'application/octet-stream' }
        )
      : new Blob([input.bodyText], { type: input.mimeType || 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = suggestedResponseFilename(input.url, input.mimeType);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

function responseBodyLanguage(body: string) {
  if (body.trim().startsWith('{') || body.trim().startsWith('[')) return 'json';
  return 'text';
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return null;
  }
}

function matchesSearch(values: Array<string | number | null | undefined>, needle: string) {
  if (!needle) return true;
  return values.some(value => String(value || '').toLowerCase().includes(needle));
}

function searchBodyLines(text: string, needle: string, limit = 12) {
  if (!needle) return [] as Array<{ lineNumber: number; text: string }>;
  return text
    .split('\n')
    .map((line, index) => ({ lineNumber: index + 1, text: line }))
    .filter(entry => entry.text.toLowerCase().includes(needle))
    .slice(0, limit);
}

function countSearchMatches(text: string, needle: string) {
  if (!needle) return 0;
  const lowerText = text.toLowerCase();
  let count = 0;
  let cursor = 0;
  while (cursor < lowerText.length) {
    const matchIndex = lowerText.indexOf(needle, cursor);
    if (matchIndex === -1) break;
    count += 1;
    cursor = matchIndex + Math.max(needle.length, 1);
  }
  return count;
}

function compareLineRows(left: string, right: string, limit = 200) {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const length = Math.max(leftLines.length, rightLines.length);
  const rows: Array<{ lineNumber: number; live: string; saved: string; type: 'added' | 'removed' | 'changed' }> = [];
  for (let index = 0; index < length; index += 1) {
    const live = leftLines[index] || '';
    const saved = rightLines[index] || '';
    if (live === saved) continue;
    rows.push({
      lineNumber: index + 1,
      live,
      saved,
      type: live && !saved ? 'added' : !live && saved ? 'removed' : 'changed'
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function buildWorkbenchRows(left: string, right: string, limit = 500) {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const totalLines = Math.max(leftLines.length, rightLines.length);
  return {
    totalLines,
    truncated: totalLines > limit,
    rows: Array.from({ length: Math.min(totalLines, limit) }, (_, index) => {
      const live = leftLines[index] || '';
      const saved = rightLines[index] || '';
      return {
        lineNumber: index + 1,
        live,
        saved,
        changed: live !== saved
      };
    })
  };
}

function diffSegmentBounds(left: string, right: string) {
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length - 1;
  let rightEnd = right.length - 1;
  while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  return {
    prefix: left.slice(0, start),
    changed: left.slice(start, leftEnd + 1),
    suffix: left.slice(leftEnd + 1)
  };
}

function renderHighlightedText(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const lowerText = text.toLowerCase();
  const fragments: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(needle, cursor);
    if (matchIndex === -1) {
      fragments.push(text.slice(cursor));
      break;
    }
    if (matchIndex > cursor) {
      fragments.push(text.slice(cursor, matchIndex));
    }
    const matched = text.slice(matchIndex, matchIndex + needle.length);
    fragments.push(<mark key={`${matchIndex}-${matched}`}>{matched}</mark>);
    cursor = matchIndex + needle.length;
  }
  return fragments;
}

function renderDiffValue(value: string, otherValue: string, needle: string) {
  const bounds = diffSegmentBounds(value, otherValue);
  return (
    <>
      {renderHighlightedText(bounds.prefix, needle)}
      {bounds.changed ? <span className="response-inline-diff">{renderHighlightedText(bounds.changed, needle)}</span> : null}
      {renderHighlightedText(bounds.suffix, needle)}
    </>
  );
}

function compareStats(left: string, right: string) {
  const leftLines = left ? left.split('\n') : [];
  const rightLines = right ? right.split('\n') : [];
  const length = Math.max(leftLines.length, rightLines.length);
  let changedLines = 0;
  for (let index = 0; index < length; index += 1) {
    if ((leftLines[index] || '') !== (rightLines[index] || '')) changedLines += 1;
  }
  return {
    liveLines: leftLines.length,
    exampleLines: rightLines.length,
    changedLines
  };
}

function flattenJsonPaths(input: unknown, prefix = '$', rows: Array<{ path: string; value: string }> = []) {
  if (Array.isArray(input)) {
    input.forEach((item, index) => flattenJsonPaths(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([key, value]) => flattenJsonPaths(value, `${prefix}.${key}`, rows));
    return rows;
  }

  rows.push({
    path: prefix,
    value: typeof input === 'string' ? input : JSON.stringify(input)
  });
  return rows;
}

function parseSetCookies(response: SendRequestResult | null) {
  if (!response) return [] as Array<{ name: string; value: string; source: string }>;
  return response.headers
    .filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => {
      const [firstPart] = header.value.split(';');
      const [name, ...rest] = firstPart.split('=');
      return {
        name: name?.trim() || 'cookie',
        value: rest.join('=').trim(),
        source: 'response'
      };
    });
}

function compareSummary(left: string, right: string) {
  if (!left && !right) return 'No content to compare yet.';
  if (left === right) return 'The live response matches the selected example.';
  const stats = compareStats(left, right);
  return `The bodies differ. Changed lines: ${stats.changedLines}, live lines: ${stats.liveLines}, example lines: ${stats.exampleLines}.`;
}

function exampleOptionLabel(name: string, role?: string) {
  return role === 'baseline' ? `${name} · Baseline` : name;
}

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  requestError: string | null;
  requestPreview: ResolvedRequestPreview | null;
  requestDocument: RequestDocument | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  sessionSnapshot: SessionSnapshot | null;
  selectedExampleName: string | null;
  activeTab: ResponseTab;
  onTabChange: (tab: ResponseTab) => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onCopyBruno?: () => void;
  onReplaceExample: () => void;
  onSaveAs?: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCheck: (input: GeneratedCheckInput) => void;
  onCreateCaseFromResponse: () => void;
  onExtractValue?: (target: 'local' | 'runtime', input: { suggestedName: string; value: string }) => void;
}) {
  const [prettifyJson, setPrettifyJson] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [compareFilter, setCompareFilter] = useState<'all' | 'changed' | 'added' | 'removed'>('all');
  const [compareView, setCompareView] = useState<'overview' | 'workbench'>('overview');
  const [selectedDiffIndex, setSelectedDiffIndex] = useState(0);
  const previewEditorViewRef = useRef<EditorView | null>(null);
  const bodyEditorViewRef = useRef<EditorView | null>(null);
  const rawEditorViewRef = useRef<EditorView | null>(null);
  const examples = props.requestDocument?.examples || [];
  const selectedExample = examples.find(item => item.name === props.selectedExampleName) || null;
  const liveBody = props.response?.bodyText ?? '';
  const displayBody = selectedExample?.text ?? liveBody;
  const displayHeaders =
    selectedExample
      ? [`Status: ${selectedExample.status || 'n/a'}`, `Content-Type: ${selectedExample.mimeType || 'unknown'}`].join('\n')
      : responseHeadersText(props.response);
  const parsedJson = useMemo(() => safeJson(displayBody), [displayBody]);
  const prettyBody = useMemo(
    () => (parsedJson == null ? displayBody : JSON.stringify(parsedJson, null, 2)),
    [displayBody, parsedJson]
  );
  const searchNeedle = searchText.trim().toLowerCase();
  const bodyView = parsedJson != null && prettifyJson ? prettyBody : displayBody;
  const mimeType = responseMimeType(props.response, selectedExample?.mimeType);
  const previewKind = responsePreviewKind(mimeType, parsedJson, props.response?.bodyBase64);
  const previewEditorValue = previewKind === 'binary' ? displayBody.slice(0, 2000) : bodyView;
  const previewDataUrl =
    props.response?.bodyBase64 && mimeType
      ? `data:${mimeType};base64,${props.response.bodyBase64}`
      : null;
  const allJsonRows = useMemo(() => flattenJsonPaths(parsedJson), [parsedJson]);
  const jsonRows = useMemo(
    () =>
      (searchNeedle
        ? allJsonRows.filter(row => matchesSearch([row.path, row.value], searchNeedle))
        : allJsonRows
      ).slice(0, 80),
    [allJsonRows, searchNeedle]
  );
  const responseCookies = useMemo(() => parseSetCookies(props.response), [props.response]);
  const filteredHeaders = useMemo(
    () =>
      props.response?.headers.filter(header => matchesSearch([header.name, header.value], searchNeedle)) || [],
    [props.response, searchNeedle]
  );
  const filteredResponseCookies = useMemo(
    () => responseCookies.filter(cookie => matchesSearch([cookie.name, cookie.value], searchNeedle)),
    [responseCookies, searchNeedle]
  );
  const sessionCookies = props.sessionSnapshot?.cookies || [];
  const filteredSessionCookies = useMemo(
    () => sessionCookies.filter(cookie => matchesSearch([cookie.name, cookie.value], searchNeedle)),
    [searchNeedle, sessionCookies]
  );
  const bodyMatches = useMemo(() => searchBodyLines(displayBody, searchNeedle), [displayBody, searchNeedle]);
  const activeBodySearchState = useMemo(() => {
    if (props.activeTab === 'body') {
      return { label: '正文', count: countSearchMatches(bodyView, searchNeedle) };
    }
    if (props.activeTab === 'raw') {
      return { label: 'Raw', count: countSearchMatches(displayBody, searchNeedle) };
    }
    if (props.activeTab === 'preview' && (previewKind === 'json' || previewKind === 'text' || previewKind === 'binary')) {
      return { label: '预览', count: countSearchMatches(previewEditorValue, searchNeedle) };
    }
    return null;
  }, [bodyView, displayBody, previewEditorValue, previewKind, props.activeTab, searchNeedle]);
  const compareStatsSummary = useMemo(
    () => compareStats(liveBody, selectedExample?.text || ''),
    [liveBody, selectedExample]
  );
  const allDiffRows = useMemo(
    () => compareLineRows(liveBody, selectedExample?.text || ''),
    [liveBody, selectedExample]
  );
  const diffCounts = useMemo(
    () =>
      allDiffRows.reduce(
        (acc, row) => {
          acc[row.type] += 1;
          return acc;
        },
        { changed: 0, added: 0, removed: 0 }
      ),
    [allDiffRows]
  );
  const diffRows = useMemo(
    () =>
      allDiffRows.filter(row =>
        (compareFilter === 'all' || row.type === compareFilter) &&
        matchesSearch([row.lineNumber, row.live, row.saved], searchNeedle)
      ),
    [allDiffRows, compareFilter, searchNeedle]
  );
  const workbench = useMemo(
    () => buildWorkbenchRows(liveBody, selectedExample?.text || ''),
    [liveBody, selectedExample]
  );
  const activeDiffRow = diffRows[selectedDiffIndex] || null;
  const responseSourceLabel = selectedExample
    ? `Viewing ${selectedExample.role === 'baseline' ? 'baseline' : 'saved example'} · ${selectedExample.name}`
    : props.response
      ? 'Viewing latest live response'
      : 'Waiting for a response';
  const surfacedSearchMatches = bodyMatches.length + jsonRows.length + filteredHeaders.length + filteredResponseCookies.length + filteredSessionCookies.length;

  useEffect(() => {
    setSelectedDiffIndex(0);
  }, [selectedExample?.name, compareFilter, searchNeedle]);

  function activeBodyEditorView() {
    if (props.activeTab === 'body') return bodyEditorViewRef.current;
    if (props.activeTab === 'raw') return rawEditorViewRef.current;
    if (props.activeTab === 'preview' && (previewKind === 'json' || previewKind === 'text' || previewKind === 'binary')) {
      return previewEditorViewRef.current;
    }
    return null;
  }

  function navigateBodySearch(direction: 'next' | 'previous') {
    const editorView = activeBodyEditorView();
    if (!editorView || !searchNeedle) return;
    if (direction === 'next') {
      findNext(editorView);
      return;
    }
    findPrevious(editorView);
  }

  return (
    <div className="response-panel">
      <div className="response-header-ide">
        <div className="response-status-group">
          <div className="response-status-copy">
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              响应结果
            </Text>
            <Text size="xs" c="dimmed">
              {responseSourceLabel}
              {(mimeType || previewKind) ? ` · ${mimeType || previewKind}` : ''}
              {searchNeedle ? ` · ${surfacedSearchMatches} surfaced matches` : ''}
            </Text>
          </div>
          {props.response ? (
            <div className="response-metrics">
              <Badge color={props.response.ok ? 'green' : 'red'} variant="light" size="sm">
                {props.response.status} {props.response.statusText}
              </Badge>
              <Text size="xs" fw={600} c="dimmed">{props.response.durationMs}ms</Text>
              <Text size="xs" fw={600} c="dimmed">{props.response.sizeBytes}B</Text>
            </div>
          ) : props.requestError ? (
            <Badge color="red" variant="filled" size="xs">请求失败</Badge>
          ) : null}
        </div>
        <Group gap="xs" wrap="wrap" className="response-header-actions">
          <div className="response-toolbar-primary">
            <TextInput
              size="xs"
              className="response-search-input"
              leftSection={<IconSearch size={14} />}
              placeholder="搜索 body / JSON / header / cookie"
              value={searchText}
              onChange={event => setSearchText(event.currentTarget.value)}
            />
            <Select
              size="xs"
              className="response-example-select"
              placeholder="查看实时响应"
              value={props.selectedExampleName || '__live__'}
              data={[
                { value: '__live__', label: '实时响应' },
                ...examples.map(example => ({ value: example.name, label: exampleOptionLabel(example.name, example.role) }))
              ]}
              onChange={value => props.onSelectExample(value === '__live__' ? null : value || null)}
            />
          </div>
          {props.response && parsedJson != null ? (
            <Button
              size="xs"
              variant={prettifyJson ? 'filled' : 'default'}
              color={prettifyJson ? 'indigo' : 'gray'}
              onClick={() => setPrettifyJson(current => !current)}
            >
              {prettifyJson ? '已格式化' : '格式化 JSON'}
            </Button>
          ) : null}
          {props.response ? (
            <Group gap={6} wrap="wrap" className="response-header-actions-secondary response-toolbar-secondary">
              <Button size="xs" variant="default" onClick={props.onCopyBody} disabled={!displayBody}>复制响应</Button>
              <Button size="xs" variant="default" onClick={props.onCopyCurl} disabled={!props.requestPreview}>复制 cURL</Button>
              <Button size="xs" variant="default" onClick={props.onCopyBruno} disabled={!props.onCopyBruno || !props.requestDocument}>
                复制 Bruno
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                onClick={() =>
                  downloadResponsePayload({
                    bodyText: displayBody,
                    bodyBase64: selectedExample ? undefined : props.response?.bodyBase64,
                    mimeType: mimeType || 'text/plain',
                    url: props.response?.url
                  })
                }
                disabled={!displayBody && !props.response?.bodyBase64}
              >
                下载响应
              </Button>
              <Button size="xs" variant="filled" color="indigo" onClick={props.onSaveAs} disabled={!props.onSaveAs}>
                Save As
              </Button>
              <Button size="xs" variant="default" onClick={props.onReplaceExample} disabled={!selectedExample}>
                覆盖当前 Example
              </Button>
            </Group>
          ) : null}
        </Group>
      </div>

      {props.response ? (
        <div className="response-quick-actions response-results-toolbar">
          {props.requestPreview?.authState ? (
            <Text size="xs" c="dimmed">
              认证 {props.requestPreview.authState.type}
              {props.requestPreview.authState.profileName ? ` · ${props.requestPreview.authState.profileName}` : ''}
              {` · 注入${props.requestPreview.authState.tokenInjected ? '成功' : '未注入'} · 缓存 ${props.requestPreview.authState.cacheStatus}`}
            </Text>
          ) : null}
          <Button size="xs" variant="default" onClick={props.onSaveAs} disabled={!props.onSaveAs}>
            保存为资产
          </Button>
          <Button
            size="xs"
            variant="light"
            onClick={() =>
              props.onCreateCheck({
                type: 'status-equals',
                label: 'Status equals current response',
                expected: String(props.response?.status || 200)
              })
            }
          >
            生成状态校验
          </Button>
          <Button size="xs" variant="default" onClick={props.onCreateCaseFromResponse}>
            从当前响应生成 Case
          </Button>
          <Button size="xs" variant="subtle" onClick={props.onRefreshSession}>
            刷新会话
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={props.onClearSession}>
            清空会话
          </Button>
        </div>
      ) : null}

      {props.checkResults.length > 0 ? (
        <div className="check-results-banner">
          {props.checkResults.map(result => (
            <div key={result.id} className="check-result-row">
              <Badge color={result.ok ? 'green' : 'red'}>{result.ok ? 'PASS' : 'FAIL'}</Badge>
              <div className="tree-row-copy">
                <strong>{result.label}</strong>
                <span>{result.message}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {props.scriptLogs.length > 0 ? (
        <div className="check-results-banner">
          {props.scriptLogs.map((log, index) => (
            <div key={`${log.phase}-${index}`} className="check-result-row">
              <Badge color={log.level === 'error' ? 'red' : 'blue'}>{log.phase}</Badge>
              <div className="tree-row-copy">
                <strong>{log.level === 'error' ? 'Script Error' : 'Script Log'}</strong>
                <span>{log.message}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {searchNeedle ? (
        <div className="response-search-summary-grid">
          <div className="compare-summary-card">
            <Text fw={700}>搜索命中</Text>
            <Text size="sm" c="dimmed">
              body {bodyMatches.length} · JSON {jsonRows.length} · headers {filteredHeaders.length} · cookies {filteredResponseCookies.length + filteredSessionCookies.length}
            </Text>
          </div>
          <div className="compare-summary-card">
            <Text fw={700}>首批正文摘录</Text>
            {bodyMatches.length > 0 ? (
              <div className="response-search-results">
                {bodyMatches.map(match => (
                  <div key={`${match.lineNumber}-${match.text}`} className="response-search-result-row">
                    <strong>L{match.lineNumber}</strong>
                    <span>{renderHighlightedText(match.text, searchNeedle)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Text size="sm" c="dimmed">正文里暂时没有命中当前关键词。</Text>
            )}
          </div>
          <div className="compare-summary-card response-editor-search-card">
            <div>
              <Text fw={700}>正文编辑器</Text>
              <Text size="sm" c="dimmed">
                {activeBodySearchState
                  ? `${activeBodySearchState.label} 标签中有 ${activeBodySearchState.count} 个全文命中。`
                  : '切换到 Preview / Body / Raw 的文本视图后可进行全文导航。'}
              </Text>
            </div>
            <Group gap={8} wrap="wrap" className="response-editor-search-actions">
              <Button
                size="xs"
                variant="default"
                onClick={() => navigateBodySearch('previous')}
                disabled={!activeBodySearchState || activeBodySearchState.count === 0}
              >
                上一个命中
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => navigateBodySearch('next')}
                disabled={!activeBodySearchState || activeBodySearchState.count === 0}
              >
                下一个命中
              </Button>
            </Group>
          </div>
        </div>
      ) : null}

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as ResponseTab)} className="response-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="preview" leftSection={<IconEye size={14} />}>预览</Tabs.Tab>
          <Tabs.Tab value="body">正文</Tabs.Tab>
          <Tabs.Tab value="json" leftSection={<IconBraces size={14} />}>JSON</Tabs.Tab>
          <Tabs.Tab value="headers">响应头</Tabs.Tab>
          <Tabs.Tab value="cookies" leftSection={<IconCookie size={14} />}>Cookies</Tabs.Tab>
          <Tabs.Tab value="compare" leftSection={<IconGitCompare size={14} />}>对比</Tabs.Tab>
          <Tabs.Tab value="raw">Raw</Tabs.Tab>
        </Tabs.List>

        <div className="response-tab-content">
          {props.requestError ? (
            <div className="error-response-state" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: 'var(--red)',
              gap: 16,
              padding: 24,
              textAlign: 'center'
            }}>
              <IconAlertCircle size={48} stroke={1.5} />
              <div>
                <Text fw={700} size="md">请求失败</Text>
                <Text size="sm" mt={4} style={{ maxWidth: 400, wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
                  {props.requestError}
                </Text>
              </div>
              <Text size="xs" c="dimmed" style={{ maxWidth: 300 }}>
                可能是网络异常、URL 无效，或服务端返回错误。请先检查请求配置与连接状态。
              </Text>
            </div>
          ) : !props.response && !selectedExample ? (
            <div className="empty-response-state" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: 'var(--muted)',
              gap: 12
            }}>
              <IconPlayerPlay size={48} stroke={1.5} opacity={0.2} />
              <Text size="sm" fw={500}>准备发送</Text>
              <Text size="xs" style={{ maxWidth: 240, textAlign: 'center' }}>
                点击“发送请求”查看实时结果，或切换到已保存的 Example / Baseline 进行对比。
              </Text>
            </div>
          ) : (
            <>
              <Tabs.Panel value="preview">
                <div className="response-adaptive-preview">
                  <div className="compare-summary-card">
                    <Text fw={700}>Content Preview</Text>
                    <Text size="sm" c="dimmed">
                      {mimeType || 'unknown'} · {previewKind} · {props.response?.sizeBytes || displayBody.length} bytes
                    </Text>
                  </div>
                  {previewKind === 'html' ? (
                    <iframe
                      title="HTML response preview"
                      className="response-preview-frame"
                      sandbox=""
                      srcDoc={displayBody}
                    />
                  ) : previewKind === 'image' && previewDataUrl ? (
                    <div className="response-preview-media-shell">
                      <img src={previewDataUrl} alt="Response preview" className="response-preview-image" />
                    </div>
                  ) : previewKind === 'audio' && previewDataUrl ? (
                    <div className="response-preview-media-shell">
                      <audio controls src={previewDataUrl} className="response-preview-media" />
                    </div>
                  ) : previewKind === 'video' && previewDataUrl ? (
                    <div className="response-preview-media-shell">
                      <video controls src={previewDataUrl} className="response-preview-video" />
                    </div>
                  ) : previewKind === 'pdf' && previewDataUrl ? (
                    <iframe
                      title="PDF response preview"
                      className="response-preview-frame"
                      src={previewDataUrl}
                    />
                  ) : previewKind === 'binary' ? (
                    <div className="check-card">
                      <Text fw={700}>Binary Response</Text>
                      <Text size="sm" c="dimmed">
                        This response is best handled as a file. Use download to inspect it in an external viewer.
                      </Text>
                      <CodeEditor
                        value={previewEditorValue}
                        readOnly
                        language="text"
                        minHeight="140px"
                        searchQuery={searchNeedle}
                        onCreateEditor={view => {
                          previewEditorViewRef.current = view;
                        }}
                      />
                    </div>
                  ) : (
                    <CodeEditor
                      value={previewEditorValue}
                      readOnly
                      language={responseBodyLanguage(previewEditorValue)}
                      minHeight="400px"
                      searchQuery={searchNeedle}
                      onCreateEditor={view => {
                        previewEditorViewRef.current = view;
                      }}
                    />
                  )}
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="body">
                <CodeEditor
                  value={bodyView}
                  readOnly
                  language={responseBodyLanguage(bodyView)}
                  minHeight="400px"
                  searchQuery={searchNeedle}
                  onCreateEditor={view => {
                    bodyEditorViewRef.current = view;
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="json">
                {parsedJson == null ? (
                  <div className="empty-tab-state">当前响应不是有效 JSON，暂时无法进行结构化查看。</div>
                ) : (
                  <div className="json-inspector-list">
                    {jsonRows.map(row => (
                      <div key={row.path} className="json-inspector-row">
                        <div className="json-inspector-copy">
                          <strong>{row.path}</strong>
                          <span>{row.value}</span>
                        </div>
                        <Group gap={6}>
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                              props.onCreateCheck({
                                type: 'json-exists',
                                label: `JSON path exists: ${row.path}`,
                                path: row.path
                              })
                            }
                          >
                            路径存在
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() =>
                              props.onCreateCheck({
                                type: 'json-equals',
                                label: `JSON equals: ${row.path}`,
                                path: row.path,
                                expected: row.value
                              })
                            }
                          >
                            结果相等
                          </Button>
                          {props.onExtractValue ? (
                            <>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => props.onExtractValue?.('runtime', { suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'), value: row.value })}
                              >
                                提取到运行时
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => props.onExtractValue?.('local', { suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'), value: row.value })}
                              >
                                提取到本地环境
                              </Button>
                            </>
                          ) : null}
                        </Group>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>
              <Tabs.Panel value="headers">
                <div className="json-inspector-list">
                  {filteredHeaders.map(header => (
                    <div key={`${header.name}:${header.value}`} className="json-inspector-row">
                      <div className="json-inspector-copy">
                        <strong>{header.name}</strong>
                        <span>{header.value}</span>
                      </div>
                      <Group gap={6}>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() =>
                            props.onCreateCheck({
                              type: 'header-equals',
                              label: `Header equals: ${header.name}`,
                              path: header.name.toLowerCase(),
                              expected: header.value
                            })
                          }
                        >
                          Equals
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            props.onCreateCheck({
                              type: 'header-includes',
                              label: `Header includes: ${header.name}`,
                              path: header.name.toLowerCase(),
                              expected: header.value
                            })
                          }
                        >
                          Includes
                        </Button>
                        {props.onExtractValue ? (
                          <>
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => props.onExtractValue?.('runtime', { suggestedName: header.name, value: header.value })}
                            >
                              Runtime Var
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => props.onExtractValue?.('local', { suggestedName: header.name, value: header.value })}
                            >
                              Local Var
                            </Button>
                          </>
                        ) : null}
                      </Group>
                    </div>
                  ))}
                  {filteredHeaders.length === 0 ? (
                    <div className="empty-tab-state">
                      {searchNeedle ? '当前搜索词没有命中响应头。' : '当前没有采集到响应头。'}
                    </div>
                  ) : null}
                  <CodeEditor value={displayHeaders} readOnly language="text" minHeight="180px" />
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="cookies">
                <div className="response-cookie-grid">
                  <div className="check-card">
                    <Text fw={700}>响应 Set-Cookie</Text>
                    {filteredResponseCookies.length === 0 ? (
                      <div className="empty-tab-state">
                        {searchNeedle ? '当前搜索词没有命中响应 Set-Cookie。' : '当前响应没有返回 Set-Cookie。'}
                      </div>
                    ) : (
                      <div className="json-inspector-list">
                        {filteredResponseCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('runtime', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到运行时
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('local', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到本地环境
                                </Button>
                              </Group>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>当前会话 Cookies</Text>
                    {filteredSessionCookies.length === 0 ? (
                      <div className="empty-tab-state">
                        {searchNeedle ? '当前搜索词没有命中会话 Cookie。' : '当前请求 URL 还没有可复用的会话 Cookie。'}
                      </div>
                    ) : (
                      <div className="json-inspector-list">
                        {filteredSessionCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('runtime', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到运行时
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('local', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到本地环境
                                </Button>
                              </Group>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <CodeEditor value={props.sessionSnapshot?.cookieHeader || ''} readOnly language="text" minHeight="96px" />
                  </div>
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="compare">
                <div className="compare-summary-card">
                  <Text fw={700}>实时响应 vs 已保存结果</Text>
                  <Text size="sm" c="dimmed">
                    {selectedExample
                      ? compareSummary(liveBody, selectedExample.text || '')
                      : '选择一个已保存的 Example 或 Baseline，和最新响应做差异对比。'}
                  </Text>
                  {selectedExample ? (
                    <Text size="xs" c="dimmed">
                      Diff snapshot · changed {compareStatsSummary.changedLines} / live {compareStatsSummary.liveLines} / example {compareStatsSummary.exampleLines}
                    </Text>
                  ) : null}
                </div>
                {selectedExample ? (
                  <div className="response-search-summary-grid">
                    <div className="compare-summary-card">
                      <Text fw={700}>Diff Breakdown</Text>
                      <Text size="sm" c="dimmed">
                        changed {diffCounts.changed} · added {diffCounts.added} · removed {diffCounts.removed}
                      </Text>
                    </div>
                    <div className="compare-summary-card">
                      <Text fw={700}>Diff Filter</Text>
                      <Select
                        size="xs"
                        value={compareFilter}
                        data={[
                          { value: 'all', label: 'All differences' },
                          { value: 'changed', label: 'Changed lines' },
                          { value: 'added', label: 'Added in live response' },
                          { value: 'removed', label: 'Missing from live response' }
                        ]}
                        onChange={value => setCompareFilter((value as typeof compareFilter) || 'all')}
                      />
                    </div>
                    <div className="compare-summary-card">
                      <Text fw={700}>Compare View</Text>
                      <Select
                        size="xs"
                        value={compareView}
                        data={[
                          { value: 'overview', label: 'Overview cards' },
                          { value: 'workbench', label: 'Merge workbench' }
                        ]}
                        onChange={value => setCompareView((value as typeof compareView) || 'overview')}
                      />
                    </div>
                  </div>
                ) : null}
                {compareView === 'workbench' && selectedExample ? (
                  <div className="response-merge-shell">
                    <div className="compare-summary-card response-merge-toolbar">
                      <div>
                        <Text fw={700}>Diff Navigation</Text>
                        <Text size="sm" c="dimmed">
                          {diffRows.length > 0
                            ? `Focused diff ${selectedDiffIndex + 1} / ${diffRows.length} · line ${activeDiffRow?.lineNumber}`
                            : 'No diff rows match the current filter.'}
                        </Text>
                      </div>
                      <Group gap={8}>
                        <Button size="xs" variant="default" onClick={() => setSelectedDiffIndex(current => Math.max(current - 1, 0))} disabled={selectedDiffIndex <= 0 || diffRows.length === 0}>
                          上一个差异
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() => setSelectedDiffIndex(current => Math.min(current + 1, Math.max(diffRows.length - 1, 0)))}
                          disabled={selectedDiffIndex >= diffRows.length - 1 || diffRows.length === 0}
                        >
                          下一个差异
                        </Button>
                      </Group>
                    </div>
                    <div className="response-merge-grid">
                      <div className="check-card response-merge-column">
                        <Text fw={700}>实时响应</Text>
                        <div className="response-merge-body">
                          {workbench.rows.map(row => (
                            <div
                              key={`live-${row.lineNumber}`}
                              className={
                                activeDiffRow?.lineNumber === row.lineNumber
                                  ? 'response-merge-row is-active'
                                  : row.changed
                                    ? 'response-merge-row is-changed'
                                    : 'response-merge-row'
                              }
                            >
                              <strong>{row.lineNumber}</strong>
                              <span>{row.changed ? renderDiffValue(row.live || '∅', row.saved || '', searchNeedle) : renderHighlightedText(row.live || '∅', searchNeedle)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="check-card response-merge-column">
                        <Group justify="space-between">
                          <Text fw={700}>已选结果</Text>
                          {selectedExample?.role === 'baseline' ? (
                            <Badge color="indigo" variant="light">
                              Baseline
                            </Badge>
                          ) : null}
                        </Group>
                        <div className="response-merge-body">
                          {workbench.rows.map(row => (
                            <div
                              key={`saved-${row.lineNumber}`}
                              className={
                                activeDiffRow?.lineNumber === row.lineNumber
                                  ? 'response-merge-row is-active'
                                  : row.changed
                                    ? 'response-merge-row is-changed'
                                    : 'response-merge-row'
                              }
                            >
                              <strong>{row.lineNumber}</strong>
                              <span>{row.changed ? renderDiffValue(row.saved || '∅', row.live || '', searchNeedle) : renderHighlightedText(row.saved || '∅', searchNeedle)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {workbench.truncated ? (
                      <div className="empty-tab-state">
                        Workbench 视图当前展示前 500 行，共 {workbench.totalLines} 行；请结合下方差异卡片继续定位。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="response-compare-grid">
                    <div className="check-card">
                      <Text fw={700}>实时响应</Text>
                      <CodeEditor value={liveBody} readOnly language={responseBodyLanguage(liveBody)} minHeight="320px" />
                    </div>
                    <div className="check-card">
                      <Group justify="space-between">
                        <Text fw={700}>已选结果</Text>
                        {selectedExample?.role === 'baseline' ? (
                          <Badge color="indigo" variant="light">
                            Baseline
                          </Badge>
                        ) : null}
                      </Group>
                      <CodeEditor
                        value={selectedExample?.text || ''}
                        readOnly
                        language={responseBodyLanguage(selectedExample?.text || '')}
                        minHeight="320px"
                      />
                    </div>
                  </div>
                )}
                {selectedExample ? (
                  <div className="json-inspector-list">
                    {(searchNeedle ? diffRows : diffRows.slice(0, 12)).map(row => (
                      <div key={`diff-${row.lineNumber}`} className={`response-diff-row response-diff-row-${row.type}`}>
                        <div className="response-diff-meta">
                          <Badge
                            size="xs"
                            variant="light"
                            color={row.type === 'added' ? 'green' : row.type === 'removed' ? 'red' : 'indigo'}
                          >
                            L{row.lineNumber}
                          </Badge>
                          <Badge size="xs" variant="dot" color={row.type === 'added' ? 'green' : row.type === 'removed' ? 'red' : 'yellow'}>
                            {row.type}
                          </Badge>
                        </div>
                        <div className="response-diff-columns">
                          <div className="response-diff-column">
                            <strong>实时响应</strong>
                            <span>{renderDiffValue(row.live || '∅', row.saved || '', searchNeedle)}</span>
                          </div>
                          <div className="response-diff-column">
                            <strong>已选结果</strong>
                            <span>{renderDiffValue(row.saved || '∅', row.live || '', searchNeedle)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {diffRows.length === 0 ? (
                      <div className="empty-tab-state">
                        {searchNeedle ? '当前搜索词没有命中差异行。' : '当前没有可展示的差异行。'}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Tabs.Panel>
              <Tabs.Panel value="raw">
                <CodeEditor
                  value={displayBody}
                  readOnly
                  language="text"
                  minHeight="400px"
                  searchQuery={searchNeedle}
                  onCreateEditor={view => {
                    rawEditorViewRef.current = view;
                  }}
                />
              </Tabs.Panel>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
