import { useMemo } from 'react';
import { ActionIcon, Button, Divider, Group, Select, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconLink, IconUpload } from '@tabler/icons-react';
import type { ImportAuth, WorkspaceIndex } from '@yapi-debugger/schema';

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
  onPreviewUrl: () => void;
  onConfirmImport: () => void;
  onOpenScratchFromImport: () => void;
}) {
  return (
    <div className="import-panel-shell">
      <div className="inspector-section">
        <h3 className="section-title">Import API Specifications</h3>
        <p className="section-description">Import external API definitions into your project.</p>

        <div className="import-actions">
          <Button
            variant="light"
            leftSection={<IconUpload size={16} />}
            onClick={props.onChooseFile}
            fullWidth
          >
            Import from Local File
          </Button>

          <Divider label="OR" labelPosition="center" my="lg" />

          <TextInput
            label="Specification URL"
            placeholder="https://api.example.com/swagger.json"
            value={props.importUrl}
            onChange={event => props.onImportUrlChange(event.currentTarget.value)}
            leftSection={<IconLink size={14} />}
          />

          <Select
            label="Auth Mode"
            mt="md"
            value={props.importAuth.mode}
            data={[
              { value: 'none', label: 'No Token' },
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'header', label: 'Custom Header' },
              { value: 'query', label: 'Query Parameter' }
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
                placeholder="Your token here"
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
            Preview URL Import
          </Button>
        </div>
      </div>

      {props.importPreviewInfo && (
        <div className="inspector-section">
          <h3 className="section-title">Import Preview</h3>
          <div className="import-preview-grid">
            <div className="summary-tile">
              <span>Format</span>
              <strong>{props.importPreviewInfo.format}</strong>
            </div>
            <div className="summary-tile">
              <span>Endpoints</span>
              <strong>{props.importPreviewInfo.endpoints}</strong>
            </div>
            <div className="summary-tile">
              <span>Folders</span>
              <strong>{props.importPreviewInfo.folders}</strong>
            </div>
            <div className="summary-tile">
              <span>Envs</span>
              <strong>{props.importPreviewInfo.environments}</strong>
            </div>
            <div className="summary-tile">
              <span>Conflicts</span>
              <strong style={{ color: props.importPreviewInfo.conflicts > 0 ? 'var(--orange)' : 'inherit' }}>
                {props.importPreviewInfo.conflicts}
              </strong>
            </div>
            <div className="summary-tile">
              <span>Warnings</span>
              <strong style={{ color: props.importPreviewInfo.warnings > 0 ? 'var(--orange)' : 'inherit' }}>
                {props.importPreviewInfo.warnings}
              </strong>
            </div>
            <div className="summary-tile">
              <span>New</span>
              <strong>{props.importPreviewInfo.newRequests}</strong>
            </div>
            <div className="summary-tile">
              <span>Runnable</span>
              <strong>{props.importPreviewInfo.runnableScore}%</strong>
            </div>
            <div className="summary-tile">
              <span>Ready</span>
              <strong>{props.importPreviewInfo.runnableRequests}</strong>
            </div>
            <div className="summary-tile">
              <span>Blocked</span>
              <strong style={{ color: props.importPreviewInfo.blockedRequests > 0 ? 'var(--orange)' : 'inherit' }}>
                {props.importPreviewInfo.blockedRequests}
              </strong>
            </div>
            <div className="summary-tile">
              <span>Examples</span>
              <strong>{props.importPreviewInfo.exampleCount}</strong>
            </div>
          </div>

          <div className="import-preview-grid" style={{ marginTop: 12 }}>
            {props.importPreviewInfo.warningBreakdown.map(item => (
              <div key={item.label} className="summary-tile">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>

          {props.warnings.length > 0 ? (
            <div className="checks-list" style={{ marginTop: 16 }}>
              {props.warnings.map((warning, index) => (
                <div key={`${warning.level}-${index}`} className="check-card">
                  <Text fw={700}>{warning.level.toUpperCase()}</Text>
                  <Text size="sm" c="dimmed">{warning.message}</Text>
                </div>
              ))}
            </div>
          ) : null}

          <Select
            label="Conflict Strategy"
            mt="lg"
            value={props.importStrategy}
            data={[
              { value: 'append', label: 'Append (Create duplicates)' },
              { value: 'replace', label: 'Replace (Overwrite existing)' }
            ]}
            onChange={value => props.onImportStrategyChange(value as any)}
          />

          {props.importPreviewInfo.nextSteps.length > 0 ? (
            <div className="check-card" style={{ marginTop: 16 }}>
              <Text fw={700}>Next Steps</Text>
              <div className="checks-list">
                {props.importPreviewInfo.nextSteps.map(step => (
                  <div key={step} className="check-result-row">
                    <div className="tree-row-copy">
                      <strong>Recommendation</strong>
                      <span>{step}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button mt="xl" size="md" color="teal" fullWidth onClick={props.onConfirmImport}>
            Apply to Project
          </Button>
          <Button mt="sm" size="md" variant="default" fullWidth onClick={props.onOpenScratchFromImport}>
            Open First Imported Request In Scratch
          </Button>
        </div>
      )}

      {!props.importPreviewInfo && (
        <div className="import-help-footer" style={{ marginTop: 40 }}>
          <Text size="sm" c="dimmed" ta="center">
            Preview a local file or remote URL first. After importing, definitions will be converted into Project / Category / Request / Case structure.
          </Text>
        </div>
      )}
    </div>
  );
}
