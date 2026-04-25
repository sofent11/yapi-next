import { Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';

export type PreferencesState = {
  theme: 'light' | 'dark';
  uiScale: number;
  codeFontSize: number;
  keybindingPreset: 'default' | 'vscode';
  commandPaletteShortcut: string;
  runtimeDefaults: {
    proxyUrl: string;
    clientCertificatePath: string;
    clientCertificateKeyPath: string;
    caCertificatePath: string;
  };
};

export function PreferencesCenterPanel(props: {
  preferences: PreferencesState;
  onChange: (preferences: PreferencesState) => void;
  onClearCaches: () => void;
}) {
  const { preferences } = props;

  return (
    <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Preferences</span>
        </div>
      </div>

      <div className="project-inspector">
        <div className="inspector-section">
          <h3 className="section-title">Appearance</h3>
          <div className="form-grid form-grid-2">
            <Select
              label="Theme"
              value={preferences.theme}
              data={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              onChange={value => value && props.onChange({ ...preferences, theme: value as PreferencesState['theme'] })}
            />
            <Select
              label="Keybinding Preset"
              value={preferences.keybindingPreset}
              data={[
                { value: 'default', label: 'Default (Command Palette: Mod+K)' },
                { value: 'vscode', label: 'VS Code (Command Palette: Mod+Shift+P)' }
              ]}
              onChange={value =>
                value &&
                props.onChange({
                  ...preferences,
                  keybindingPreset: value as PreferencesState['keybindingPreset'],
                  commandPaletteShortcut: value === 'vscode' ? 'mod + shift + P' : 'mod + K'
                })
              }
            />
            <NumberInput
              label="UI Zoom"
              min={90}
              max={125}
              step={5}
              suffix="%"
              value={Math.round(preferences.uiScale * 100)}
              onChange={value => {
                const next = typeof value === 'number' ? value : 100;
                props.onChange({ ...preferences, uiScale: next / 100 });
              }}
            />
            <NumberInput
              label="Code Font Size"
              min={12}
              max={18}
              step={1}
              suffix="px"
              value={preferences.codeFontSize}
              onChange={value => {
                const next = typeof value === 'number' ? value : 13;
                props.onChange({ ...preferences, codeFontSize: next });
              }}
            />
          </div>
          <Text size="xs" c="dimmed">
            Current command palette shortcut: <strong>{preferences.commandPaletteShortcut}</strong>
          </Text>
        </div>

        <div className="inspector-section">
          <h3 className="section-title">Runtime Defaults</h3>
          <div className="form-grid form-grid-2">
            <TextInput
              label="Proxy URL"
              placeholder="http://127.0.0.1:8080"
              value={preferences.runtimeDefaults.proxyUrl}
              onChange={event =>
                props.onChange({
                  ...preferences,
                  runtimeDefaults: { ...preferences.runtimeDefaults, proxyUrl: event.currentTarget.value }
                })
              }
            />
            <TextInput
              label="CA Certificate"
              placeholder="/path/to/ca.pem"
              value={preferences.runtimeDefaults.caCertificatePath}
              onChange={event =>
                props.onChange({
                  ...preferences,
                  runtimeDefaults: { ...preferences.runtimeDefaults, caCertificatePath: event.currentTarget.value }
                })
              }
            />
            <TextInput
              label="Client Certificate"
              placeholder="/path/to/client.pem"
              value={preferences.runtimeDefaults.clientCertificatePath}
              onChange={event =>
                props.onChange({
                  ...preferences,
                  runtimeDefaults: { ...preferences.runtimeDefaults, clientCertificatePath: event.currentTarget.value }
                })
              }
            />
            <TextInput
              label="Client Key"
              placeholder="/path/to/client-key.pem"
              value={preferences.runtimeDefaults.clientCertificateKeyPath}
              onChange={event =>
                props.onChange({
                  ...preferences,
                  runtimeDefaults: { ...preferences.runtimeDefaults, clientCertificateKeyPath: event.currentTarget.value }
                })
              }
            />
          </div>
          <Text size="xs" c="dimmed">
            These defaults are applied as runtime fallbacks when a request or case does not already define proxy/certificate settings.
          </Text>
        </div>

        <div className="inspector-section danger-section">
          <div className="danger-section-copy">
            <Text fw={700}>Local Cache Controls</Text>
            <Text size="xs" c="dimmed">
              Clears recent workspaces, persisted debugger UI state, import sessions, and volatile runtime/session cache stored in the desktop app.
            </Text>
          </div>
          <Group gap="sm">
            <Button variant="light" color="red" onClick={props.onClearCaches}>
              Clear Local Caches
            </Button>
          </Group>
        </div>
      </div>
    </section>
  );
}
