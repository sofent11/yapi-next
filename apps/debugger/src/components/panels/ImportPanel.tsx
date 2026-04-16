import { Button, Divider, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import type { ImportAuth, ImportResult } from '@yapi-debugger/schema';
import type { ImportPreviewSummary, ImportConflictStrategy } from '../../lib/workspace';

export function ImportPanel(props: {
  preview: ImportResult | null;
  previewInfo: ImportPreviewSummary | null;
  importAuth: ImportAuth;
  importUrl: string;
  importStrategy: ImportConflictStrategy;
  setImportUrl: (value: string) => void;
  setImportAuth: (auth: ImportAuth) => void;
  setImportStrategy: (strategy: ImportConflictStrategy) => void;
  onPickFile: () => void;
  onImportUrl: () => void;
  onApplyImport: () => void;
}) {
  return (
    <section className="import-panel">
      <div className="import-panel-head">
        <div>
          <p className="eyebrow">Project Import</p>
          <h3>把外部规范导入到当前项目</h3>
        </div>
      </div>

      <Stack gap="md">
        <Button size="xs" color="dark" variant="light" onClick={props.onPickFile}>
          从本地文件导入
        </Button>
        <Divider label="或" labelPosition="center" />
        <TextInput
          label="规范 URL"
          size="xs"
          placeholder="https://example.com/openapi.json"
          value={props.importUrl}
          onChange={event => props.setImportUrl(event.currentTarget.value)}
        />
        <Select
          label="Token 模式"
          size="xs"
          value={props.importAuth.mode}
          data={[
            { value: 'none', label: '不使用 Token' },
            { value: 'bearer', label: 'Bearer Token' },
            { value: 'header', label: '自定义 Header' },
            { value: 'query', label: 'Query 参数' }
          ]}
          onChange={value =>
            value &&
            props.setImportAuth({
              ...props.importAuth,
              mode: value as ImportAuth['mode']
            })
          }
        />
        {props.importAuth.mode !== 'none' ? (
          <Group grow>
            {props.importAuth.mode === 'bearer' ? null : (
              <TextInput
                label="Key"
                size="xs"
                value={props.importAuth.key || ''}
                onChange={event => props.setImportAuth({ ...props.importAuth, key: event.currentTarget.value })}
              />
            )}
            <TextInput
              label={props.importAuth.mode === 'bearer' ? 'Token' : 'Value'}
              size="xs"
              value={props.importAuth.mode === 'bearer' ? props.importAuth.token || '' : props.importAuth.value || ''}
              onChange={event =>
                props.setImportAuth(
                  props.importAuth.mode === 'bearer'
                    ? { ...props.importAuth, token: event.currentTarget.value }
                    : { ...props.importAuth, value: event.currentTarget.value }
                )
              }
            />
          </Group>
        ) : null}
        <Button size="xs" color="dark" onClick={props.onImportUrl}>
          预览 URL 导入
        </Button>
        <Select
          label="冲突策略"
          size="xs"
          value={props.importStrategy}
          data={[
            { value: 'append', label: '追加导入' },
            { value: 'replace', label: '冲突时覆盖' }
          ]}
          onChange={value => props.setImportStrategy((value as ImportConflictStrategy) || 'append')}
        />
      </Stack>

      <div className="import-preview">
        <Text fw={700}>导入预览</Text>
        {props.preview ? (
          <>
            <div className="import-summary">
              <div>
                <span>格式</span>
                <strong>{props.preview.detectedFormat}</strong>
              </div>
              <div>
                <span>接口</span>
                <strong>{props.preview.summary.requests}</strong>
              </div>
              <div>
                <span>分类</span>
                <strong>{props.preview.summary.folders}</strong>
              </div>
              <div>
                <span>环境</span>
                <strong>{props.preview.summary.environments}</strong>
              </div>
              <div>
                <span>冲突</span>
                <strong>{props.previewInfo?.conflicts.length || 0}</strong>
              </div>
              <Button size="xs" color="dark" onClick={props.onApplyImport}>
                应用到当前项目
              </Button>
            </div>
            <div className="import-structure-list">
              {props.preview.requests.slice(0, 8).map(item => (
                <div key={item.request.id} className="import-structure-item">
                  <strong>{item.request.method} {item.request.name}</strong>
                  <span>{item.folderSegments.join('/') || 'root'} · {item.request.path || item.request.url}</span>
                </div>
              ))}
            </div>
            {props.previewInfo?.conflicts.length ? (
              <div className="checks-list" style={{ marginTop: 12 }}>
                {props.previewInfo.conflicts.slice(0, 6).map(item => (
                  <div key={item.importedRequestId} className="check-result-row">
                    <span className="tree-method-pill method-put">Conflict</span>
                    <div className="tree-row-copy">
                      <strong>{item.importedName}</strong>
                      <span>{item.folderPath || 'root'} · target: {item.targetName}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <Text c="dimmed">先预览本地文件或远程 URL。导入后会自动转换为项目 / 分类 / 接口 / 用例结构。</Text>
        )}
      </div>
    </section>
  );
}
