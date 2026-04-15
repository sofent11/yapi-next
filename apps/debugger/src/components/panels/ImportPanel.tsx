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
          <p className="eyebrow">Import</p>
          <h3>Bring external specs into this workspace</h3>
        </div>
      </div>

      <Stack gap="md">
        <Button color="dark" variant="light" onClick={props.onPickFile}>
          Import From Local File
        </Button>
        <Divider label="or" labelPosition="center" />
        <TextInput
          label="Spec URL"
          placeholder="https://example.com/openapi.json"
          value={props.importUrl}
          onChange={event => props.setImportUrl(event.currentTarget.value)}
        />
        <Select
          label="Token Mode"
          value={props.importAuth.mode}
          data={[
            { value: 'none', label: 'No Token' },
            { value: 'bearer', label: 'Bearer Token' },
            { value: 'header', label: 'Custom Header' },
            { value: 'query', label: 'Query Parameter' }
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
          Preview URL Import
        </Button>
      </Stack>

      <div className="import-preview">
        <Text fw={700}>Preview</Text>
        {props.preview ? (
          <div className="import-summary">
            <div>
              <span>Format</span>
              <strong>{props.preview.detectedFormat}</strong>
            </div>
            <div>
              <span>Requests</span>
              <strong>{props.preview.summary.requests}</strong>
            </div>
            <div>
              <span>Folders</span>
              <strong>{props.preview.summary.folders}</strong>
            </div>
            <div>
              <span>Environments</span>
              <strong>{props.preview.summary.environments}</strong>
            </div>
            <Button color="dark" onClick={props.onApplyImport}>
              Apply Import
            </Button>
          </div>
        ) : (
          <Text c="dimmed">Preview a local file or a remote URL first. We will convert it into request and case files in this project.</Text>
        )}
      </div>
    </section>
  );
}
