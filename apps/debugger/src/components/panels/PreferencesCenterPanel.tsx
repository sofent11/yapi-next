import { Button, Group, NumberInput, Select, Text, TextInput } from '@mantine/core';

export type KeybindingPreset = 'default' | 'vscode' | 'custom';
export type KeybindingActionId =
  | 'commandPalette'
  | 'saveChanges'
  | 'runRequest'
  | 'openWorkbench'
  | 'openScratch'
  | 'openCapture'
  | 'openCollections'
  | 'openHistory'
  | 'openEnvironments'
  | 'openSync'
  | 'openPreferences';
export type KeybindingMap = Record<KeybindingActionId, string>;

type KeybindingOption = {
  value: string;
  label: string;
};

type KeybindingDefinition = {
  id: KeybindingActionId;
  label: string;
  description: string;
  options: KeybindingOption[];
};

const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
  {
    id: 'commandPalette',
    label: 'Command Palette',
    description: 'Open the indexed workspace command search.',
    options: [
      { value: 'mod + K', label: 'Mod + K' },
      { value: 'mod + shift + P', label: 'Mod + Shift + P' }
    ]
  },
  {
    id: 'saveChanges',
    label: 'Save Changes',
    description: 'Persist the current workspace, request, environment, or collection edits.',
    options: [
      { value: 'mod + S', label: 'Mod + S' },
      { value: 'mod + shift + S', label: 'Mod + Shift + S' }
    ]
  },
  {
    id: 'runRequest',
    label: 'Run Current Request',
    description: 'Run the active workspace request or the current Scratch request.',
    options: [
      { value: 'mod + Enter', label: 'Mod + Enter' },
      { value: 'shift + Enter', label: 'Shift + Enter' }
    ]
  },
  {
    id: 'openWorkbench',
    label: 'Open Workbench',
    description: 'Return to the main workspace overview and request tabs.',
    options: [
      { value: 'mod + alt + 1', label: 'Mod + Alt + 1' },
      { value: 'mod + alt + W', label: 'Mod + Alt + W' }
    ]
  },
  {
    id: 'openScratch',
    label: 'Open Scratch Pad',
    description: 'Jump into scratch requests without leaving the keyboard.',
    options: [
      { value: 'mod + alt + 2', label: 'Mod + Alt + 2' },
      { value: 'mod + alt + N', label: 'Mod + Alt + N' }
    ]
  },
  {
    id: 'openCapture',
    label: 'Open Capture',
    description: 'Switch to the browser capture workflow and live network intake.',
    options: [
      { value: 'mod + alt + 3', label: 'Mod + Alt + 3' },
      { value: 'mod + alt + B', label: 'Mod + Alt + B' }
    ]
  },
  {
    id: 'openCollections',
    label: 'Open Collections',
    description: 'Jump to collection design, data, and run reports.',
    options: [
      { value: 'mod + alt + 4', label: 'Mod + Alt + 4' },
      { value: 'mod + alt + C', label: 'Mod + Alt + C' }
    ]
  },
  {
    id: 'openHistory',
    label: 'Open History',
    description: 'Inspect recent request runs and saved response examples.',
    options: [
      { value: 'mod + alt + 5', label: 'Mod + Alt + 5' },
      { value: 'mod + alt + H', label: 'Mod + Alt + H' }
    ]
  },
  {
    id: 'openEnvironments',
    label: 'Open Environment Center',
    description: 'Jump to environment variables, session defaults, and prompt values.',
    options: [
      { value: 'mod + E', label: 'Mod + E' },
      { value: 'mod + shift + E', label: 'Mod + Shift + E' }
    ]
  },
  {
    id: 'openSync',
    label: 'Open Sync Center',
    description: 'Review Git status, diff details, and push or pull workspace changes.',
    options: [
      { value: 'mod + alt + 6', label: 'Mod + Alt + 6' },
      { value: 'mod + alt + G', label: 'Mod + Alt + G' }
    ]
  },
  {
    id: 'openPreferences',
    label: 'Open Preferences',
    description: 'Jump directly into the Preferences center from anywhere in the debugger.',
    options: [
      { value: 'mod + ,', label: 'Mod + ,' },
      { value: 'mod + .', label: 'Mod + .' }
    ]
  }
];

export function keybindingsForPreset(preset: Exclude<KeybindingPreset, 'custom'>): KeybindingMap {
  if (preset === 'vscode') {
    return {
      commandPalette: 'mod + shift + P',
      saveChanges: 'mod + S',
      runRequest: 'mod + Enter',
      openWorkbench: 'mod + alt + 1',
      openScratch: 'mod + alt + 2',
      openCapture: 'mod + alt + 3',
      openCollections: 'mod + alt + 4',
      openHistory: 'mod + alt + 5',
      openEnvironments: 'mod + E',
      openSync: 'mod + alt + 6',
      openPreferences: 'mod + ,'
    };
  }

  return {
    commandPalette: 'mod + K',
    saveChanges: 'mod + S',
    runRequest: 'mod + Enter',
    openWorkbench: 'mod + alt + 1',
    openScratch: 'mod + alt + 2',
    openCapture: 'mod + alt + 3',
    openCollections: 'mod + alt + 4',
    openHistory: 'mod + alt + 5',
    openEnvironments: 'mod + E',
    openSync: 'mod + alt + 6',
    openPreferences: 'mod + ,'
  };
}

export function inferKeybindingPreset(keybindings: KeybindingMap): KeybindingPreset {
  const defaultPreset = keybindingsForPreset('default');
  const vscodePreset = keybindingsForPreset('vscode');

  if (Object.keys(defaultPreset).every(key => keybindings[key as KeybindingActionId] === defaultPreset[key as KeybindingActionId])) {
    return 'default';
  }

  if (Object.keys(vscodePreset).every(key => keybindings[key as KeybindingActionId] === vscodePreset[key as KeybindingActionId])) {
    return 'vscode';
  }

  return 'custom';
}

export type PreferencesState = {
  theme: 'light' | 'dark';
  uiScale: number;
  codeFontSize: number;
  keybindingPreset: KeybindingPreset;
  commandPaletteShortcut: string;
  keybindings: KeybindingMap;
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
  const keybindingPresetData = [
    { value: 'default', label: 'Default' },
    { value: 'vscode', label: 'VS Code' },
    { value: 'custom', label: 'Custom (manual overrides)' }
  ];
  const preferenceSummary = [
    { label: 'Theme', value: preferences.theme === 'dark' ? 'Dark' : 'Light' },
    { label: 'Zoom', value: `${Math.round(preferences.uiScale * 100)}%` },
    { label: 'Code Font', value: `${preferences.codeFontSize}px` },
    {
      label: 'Shortcuts',
      value:
        preferences.keybindingPreset === 'custom'
          ? 'Custom'
          : preferences.keybindingPreset === 'vscode'
            ? 'VS Code'
            : 'Default'
    }
  ];

  function applyPreset(value: KeybindingPreset) {
    if (value === 'custom') {
      props.onChange({
        ...preferences,
        keybindingPreset: 'custom',
        commandPaletteShortcut: preferences.keybindings.commandPalette
      });
      return;
    }

    const nextKeybindings = keybindingsForPreset(value);
    props.onChange({
      ...preferences,
      keybindingPreset: value,
      commandPaletteShortcut: nextKeybindings.commandPalette,
      keybindings: nextKeybindings
    });
  }

  function updateKeybinding(action: KeybindingActionId, shortcut: string) {
    const nextKeybindings = {
      ...preferences.keybindings,
      [action]: shortcut
    };
    props.onChange({
      ...preferences,
      keybindingPreset: inferKeybindingPreset(nextKeybindings),
      commandPaletteShortcut: nextKeybindings.commandPalette,
      keybindings: nextKeybindings
    });
  }

  return (
    <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Preferences</span>
        </div>
      </div>

      <div className="center-intro">
        <Text size="sm" c="dimmed">
          Keep the debugger compact and predictable: visual scale, editor readability, shortcuts, and runtime defaults should all reinforce the same workbench rhythm.
        </Text>
        <div className="summary-grid center-summary-grid">
          {preferenceSummary.map(item => (
            <div key={item.label} className="summary-chip">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
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
              data={keybindingPresetData}
              description="Presets provide safe defaults; manual edits automatically switch to Custom."
              onChange={value => value && applyPreset(value as PreferencesState['keybindingPreset'])}
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
            Current command palette shortcut: <strong>{preferences.keybindings.commandPalette}</strong>
          </Text>
        </div>

        <div className="inspector-section">
          <h3 className="section-title">Keybindings</h3>
          <Text size="xs" c="dimmed" mb="md">
            This focused shortcut set covers the highest-frequency request actions plus rail jumps for core debugger centers. Assigned shortcuts are filtered to avoid collisions.
          </Text>
          <div className="keybinding-grid">
            {KEYBINDING_DEFINITIONS.map(definition => {
              const currentShortcut = preferences.keybindings[definition.id];
              const usedShortcuts = new Set(
                Object.entries(preferences.keybindings)
                  .filter(([action, shortcut]) => action !== definition.id && Boolean(shortcut))
                  .map(([, shortcut]) => shortcut)
              );

              return (
                <div key={definition.id} className="keybinding-row">
                  <div className="keybinding-row-copy">
                    <strong>{definition.label}</strong>
                    <span>{definition.description}</span>
                  </div>
                  <Select
                    label="Shortcut"
                    value={currentShortcut}
                    data={definition.options.filter(option => option.value === currentShortcut || !usedShortcuts.has(option.value))}
                    onChange={value => value && updateKeybinding(definition.id, value)}
                  />
                </div>
              );
            })}
          </div>
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
