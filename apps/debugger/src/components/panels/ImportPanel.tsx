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
  } | null;
  onImportUrlChange: (url: string) => void;
  onImportStrategyChange: (strategy: 'append' | 'replace') => void;
  onImportAuthChange: (auth: ImportAuth) => void;
  onChooseFile: () => void;
  onPreviewUrl: () => void;
  onConfirmImport: () => void;
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
              { value: 'header', label: 'Custom Header' },
              { value: 'query', label: 'Query Parameter' }
            ]}
            onChange={value => props.onImportAuthChange({ ...props.importAuth, mode: value as any })}
          />

          {props.importAuth.mode !== 'none' && (
            <div className="form-grid form-grid-2" style={{ marginTop: 12 }}>
              <TextInput
                label="Key"
                placeholder={props.importAuth.mode === 'header' ? 'Authorization' : 'token'}
                value={props.importAuth.key}
                onChange={event => props.onImportAuthChange({ ...props.importAuth, key: event.currentTarget.value })}
              />
              <TextInput
                label="Value"
                placeholder="Your token here"
                value={props.importAuth.value}
                onChange={event => props.onImportAuthChange({ ...props.importAuth, value: event.currentTarget.value })}
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
          </div>

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

          <Button mt="xl" size="md" color="teal" fullWidth onClick={props.onConfirmImport}>
            Apply to Project
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
