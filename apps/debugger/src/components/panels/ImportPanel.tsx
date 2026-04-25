import { useMemo } from 'react';
import { ActionIcon, Button, Divider, Group, Select, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconFolderOpen, IconLink, IconUpload } from '@tabler/icons-react';
import type { ImportAuth, WorkspaceIndex } from '@yapi-debugger/schema';

function warningTone(level: string) {
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warning';
  return 'info';
}

export function ImportPanel(props: {
  workspace: WorkspaceIndex;
  importUrl: string;
  importStrategy: 'append' | 'replace';
  importAuth: ImportAuth;
  importPreviewInfo: {
    format: string;
    endpoints: number;
    folders: number;
    environments: number;
    conflicts: number;
    warnings: number;
    newRequests: number;
    replaceableRequests: number;
    degradedWarnings: number;
    unsupportedWarnings: number;
    compatibleScriptWarnings: number;
    exampleCount: number;
    runnableScore: number;
    runnableRequests: number;
    blockedRequests: number;
    nextSteps: string[];
    warningBreakdown: Array<{ label: string; count: number }>;
  } | null;
  warnings: Array<{ level: string; message: string }>;
  onImportUrlChange: (url: string) => void;
  onImportStrategyChange: (strategy: 'append' | 'replace') => void;
  onImportAuthChange: (auth: ImportAuth) => void;
  onChooseFile: () => void;
  onChooseBrunoFolder: () => void;
  onPreviewUrl: () => void;
  onConfirmImport: () => void;
  onOpenScratchFromImport: () => void;
}) {
  return (
    <div className="import-panel-shell">
      <div className="inspector-section">
        <h3 className="section-title">导入 API 规范</h3>
        <p className="section-description">从本地文件或远程 URL 导入 OpenAPI / Swagger / HAR / Postman / Bruno / Insomnia 数据。</p>

        <div className="import-actions">
          <Button
            variant="light"
            leftSection={<IconUpload size={16} />}
            onClick={props.onChooseFile}
            fullWidth
          >
            从本地文件导入
          </Button>
          <Button
            variant="default"
            leftSection={<IconFolderOpen size={16} />}
            onClick={props.onChooseBrunoFolder}
            fullWidth
          >
            导入 Bruno Collection 文件夹
          </Button>

          <Divider label="或者" labelPosition="center" my="lg" />

          <TextInput
            label="规范 URL"
            placeholder="https://api.example.com/swagger.json"
            value={props.importUrl}
            onChange={event => props.onImportUrlChange(event.currentTarget.value)}
            leftSection={<IconLink size={14} />}
          />

          <Select
            label="访问鉴权"
            mt="md"
            value={props.importAuth.mode}
            data={[
              { value: 'none', label: '无需鉴权' },
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'header', label: '自定义 Header' },
              { value: 'query', label: 'Query 参数' }
            ]}
            onChange={value => props.onImportAuthChange({ ...props.importAuth, mode: value as any })}
          />

          {props.importAuth.mode !== 'none' && (
            <div className="form-grid form-grid-2" style={{ marginTop: 12 }}>
              {props.importAuth.mode === 'bearer' ? null : (
                <TextInput
                  label="Key"
                  placeholder={props.importAuth.mode === 'header' ? 'Authorization' : 'token'}
                  value={props.importAuth.key}
                  onChange={event => props.onImportAuthChange({ ...props.importAuth, key: event.currentTarget.value })}
                />
              )}
              <TextInput
                label={props.importAuth.mode === 'bearer' ? 'Token' : 'Value'}
                placeholder="请输入访问凭据"
                value={props.importAuth.mode === 'bearer' ? props.importAuth.token : props.importAuth.value}
                onChange={event =>
                  props.onImportAuthChange(
                    props.importAuth.mode === 'bearer'
                      ? { ...props.importAuth, token: event.currentTarget.value }
                      : { ...props.importAuth, value: event.currentTarget.value }
                  )
                }
              />
            </div>
          )}

          <Button
            mt="lg"
            variant="filled"
            rightSection={<IconArrowRight size={16} />}
            onClick={props.onPreviewUrl}
            disabled={!props.importUrl}
            fullWidth
          >
            预览 URL 导入结果
          </Button>
        </div>
      </div>

      {props.importPreviewInfo && (
        <div className="inspector-section import-preview-section">
          <div className="import-preview-head">
            <div>
              <h3 className="section-title">导入预览</h3>
              <p className="section-description">先确认可运行率、阻塞项和冲突策略，再决定是否导入。</p>
            </div>
            <div className="import-preview-badges">
              <div className="import-preview-pill">
                <span>格式</span>
                <strong>{props.importPreviewInfo.format}</strong>
              </div>
              <div className="import-preview-pill emphasis">
                <span>可运行率</span>
                <strong>{props.importPreviewInfo.runnableScore}%</strong>
              </div>
            </div>
          </div>

          <div className="import-stat-grid primary">
            <div className="import-stat-card">
              <span>Endpoints</span>
              <strong>{props.importPreviewInfo.endpoints}</strong>
            </div>
            <div className="import-stat-card">
              <span>Folders</span>
              <strong>{props.importPreviewInfo.folders}</strong>
            </div>
            <div className="import-stat-card">
              <span>Envs</span>
              <strong>{props.importPreviewInfo.environments}</strong>
            </div>
            <div className="import-stat-card">
              <span>新增请求</span>
              <strong>{props.importPreviewInfo.newRequests}</strong>
            </div>
            <div className="import-stat-card success">
              <span>Ready</span>
              <strong>{props.importPreviewInfo.runnableRequests}</strong>
            </div>
            <div className="import-stat-card warning">
              <span>Blocked</span>
              <strong>{props.importPreviewInfo.blockedRequests}</strong>
            </div>
            <div className="import-stat-card">
              <span>Examples</span>
              <strong>{props.importPreviewInfo.exampleCount}</strong>
            </div>
            <div className="import-stat-card warning">
              <span>Warnings</span>
              <strong>{props.importPreviewInfo.warnings}</strong>
            </div>
            <div className="import-stat-card">
              <span>Conflicts</span>
              <strong>{props.importPreviewInfo.conflicts}</strong>
            </div>
          </div>

          {props.importPreviewInfo.warningBreakdown.length > 0 ? (
            <div className="import-subsection">
              <div className="import-subsection-head">
                <Text fw={700}>兼容性摘要</Text>
                <Text size="sm" c="dimmed">帮助你快速判断需要手工修复的范围。</Text>
              </div>
              <div className="import-stat-grid compact">
                {props.importPreviewInfo.warningBreakdown.map(item => (
                  <div key={item.label} className="import-stat-card compact">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="import-subsection">
            <div className="import-subsection-head">
              <Text fw={700}>冲突处理策略</Text>
              <Text size="sm" c="dimmed">同目录下出现同名请求时，选择保留副本还是直接覆盖。</Text>
            </div>
            <Select
              value={props.importStrategy}
              data={[
                { value: 'append', label: '追加导入（保留并行副本）' },
                { value: 'replace', label: '覆盖同名请求' }
              ]}
              onChange={value => props.onImportStrategyChange(value as any)}
            />
          </div>

          {props.importPreviewInfo.nextSteps.length > 0 ? (
            <div className="import-subsection">
              <div className="import-subsection-head">
                <Text fw={700}>建议动作</Text>
                <Text size="sm" c="dimmed">导入完成后最值得优先处理的下一步。</Text>
              </div>
              <div className="import-next-step-list">
                {props.importPreviewInfo.nextSteps.map((step, index) => (
                  <div key={step} className="import-next-step-item">
                    <div className="import-next-step-index">{index + 1}</div>
                    <div className="import-next-step-copy">
                      <strong>建议动作 {index + 1}</strong>
                      <span>{step}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {props.warnings.length > 0 ? (
            <div className="import-subsection">
              <div className="import-subsection-head">
                <Text fw={700}>详细告警</Text>
                <Text size="sm" c="dimmed">这些条目不会阻止导入，但会影响导入后的可用性。</Text>
              </div>
              <div className="import-warning-list">
                {props.warnings.map((warning, index) => (
                  <div key={`${warning.level}-${index}`} className={`import-warning-card ${warningTone(warning.level)}`}>
                    <div className="import-warning-level">{warning.level.toUpperCase()}</div>
                    <Text size="sm">{warning.message}</Text>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="import-preview-actions">
            <Button size="md" color="teal" fullWidth onClick={props.onConfirmImport}>
              应用到当前工作区
            </Button>
            <Button size="md" variant="default" fullWidth onClick={props.onOpenScratchFromImport}>
              在 Scratch 中打开首个导入请求
            </Button>
          </div>
        </div>
      )}

      {!props.importPreviewInfo && (
        <div className="import-help-footer" style={{ marginTop: 40 }}>
          <Text size="sm" c="dimmed" ta="center">
            先预览本地文件或远程 URL。确认无误后，系统会把它们转换成 Project / Category / Request / Case 结构。
          </Text>
        </div>
      )}
    </div>
  );
}
