import { Button, Divider, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import type { ImportAuth, ImportResult } from '@yapi-debugger/schema';

export function ImportPanel(props: {
  preview: ImportResult | null;
  importAuth: ImportAuth;
  importUrl: string;
  setImportUrl: (value: string) => void;
  setImportAuth: (auth: ImportAuth) => void;
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
        <Button color="dark" variant="light" onClick={props.onPickFile}>
          从本地文件导入
        </Button>
        <Divider label="或" labelPosition="center" />
        <TextInput
          label="规范 URL"
          placeholder="https://example.com/openapi.json"
          value={props.importUrl}
          onChange={event => props.setImportUrl(event.currentTarget.value)}
        />
        <Select
          label="Token 模式"
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
                value={props.importAuth.key || ''}
                onChange={event => props.setImportAuth({ ...props.importAuth, key: event.currentTarget.value })}
              />
            )}
            <TextInput
              label={props.importAuth.mode === 'bearer' ? 'Token' : 'Value'}
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
        <Button color="dark" onClick={props.onImportUrl}>
          预览 URL 导入
        </Button>
      </Stack>

      <div className="import-preview">
        <Text fw={700}>导入预览</Text>
        {props.preview ? (
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
            <Button color="dark" onClick={props.onApplyImport}>
              应用到当前项目
            </Button>
          </div>
        ) : (
          <Text c="dimmed">先预览本地文件或远程 URL。导入后会自动转换为项目 / 分类 / 接口 / 用例结构。</Text>
        )}
      </div>
    </section>
  );
}
