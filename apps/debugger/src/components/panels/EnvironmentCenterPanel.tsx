import { Badge, Button, Checkbox, Code, Group, Select, Text, TextInput } from '@mantine/core';
import type { AuthConfig, EnvironmentDocument, ProjectDocument, SessionSnapshot, WorkspaceIndex } from '@yapi-debugger/schema';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function authTypeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2' },
    { value: 'oauth1', label: 'oauth1' },
    { value: 'awsv4', label: 'aws signature v4' },
    { value: 'digest', label: 'digest' },
    { value: 'ntlm', label: 'ntlm' },
    { value: 'wsse', label: 'wsse' }
  ];
}

function toKeyValueRows(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ name, value, enabled: true, kind: 'text' as const }));
}

function mergeHeaderRows(sharedHeaders: EnvironmentDocument['headers'], localHeaders: EnvironmentDocument['headers']) {
  const output = [...sharedHeaders];
  const names = new Map(output.map((row, index) => [row.name.trim().toLowerCase(), index]));
  localHeaders.forEach(row => {
    const key = row.name.trim().toLowerCase();
    const existing = names.get(key);
    if (existing == null) {
      names.set(key, output.length);
      output.push(row);
      return;
    }
    output[existing] = row;
  });
  return output;
}

function rebuildEnvironment(environment: EnvironmentDocument, patch: Partial<EnvironmentDocument>) {
  const sharedVars = patch.sharedVars ?? environment.sharedVars ?? environment.vars ?? {};
  const localVars = patch.localVars ?? environment.localVars ?? {};
  const sharedHeaders = patch.sharedHeaders ?? environment.sharedHeaders ?? environment.headers ?? [];
  const localHeaders = patch.localHeaders ?? environment.localHeaders ?? [];
  const hasLocalOverlay = Object.keys(localVars).length > 0 || localHeaders.length > 0 || Boolean(environment.localFilePath);
  return {
    ...environment,
    ...patch,
    sharedVars,
    localVars,
    sharedHeaders,
    localHeaders,
    vars: {
      ...sharedVars,
      ...localVars
    },
    headers: mergeHeaderRows(sharedHeaders, localHeaders),
    overlayMode: hasLocalOverlay || environment.sharedFilePath ? 'overlay' : environment.overlayMode || 'standalone'
  };
}

export function EnvironmentCenterPanel(props: {
  workspace: WorkspaceIndex;
  draftProject: ProjectDocument | null;
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  runtimeVariables: Record<string, string>;
  sessionSnapshot: SessionSnapshot | null;
  hostSnapshots: Array<{ host: string; snapshot: SessionSnapshot }>;
  targetUrl: string | null;
  onEnvironmentChange: (name: string) => void;
  onProjectChange: (project: ProjectDocument) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onAddEnvironment: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onClearRuntimeVars: () => void;
  onSave: () => void;
}) {
  const selectedEnvironment = props.selectedEnvironment;
  const project = props.draftProject || props.workspace.project;
  const runtimeEntries = Object.entries(props.runtimeVariables);
  const sharedVarCount = Object.keys(selectedEnvironment?.sharedVars || selectedEnvironment?.vars || {}).length;
  const localVarCount = Object.keys(selectedEnvironment?.localVars || {}).length;
  const sharedHeaderCount = (selectedEnvironment?.sharedHeaders || selectedEnvironment?.headers || []).length;
  const localHeaderCount = (selectedEnvironment?.localHeaders || []).length;
  const authProfileCount = selectedEnvironment?.authProfiles.length || 0;
  const hasOverlay = localVarCount > 0 || localHeaderCount > 0 || Boolean(selectedEnvironment?.localFilePath);

  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{project.name}</span>
          <span className="breadcrumb-chip">Environments</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onAddEnvironment}>New Environment</Button>
          <Button size="xs" variant="default" onClick={props.onRefreshSession}>Refresh Runtime</Button>
          <Button size="xs" onClick={props.onSave}>Save</Button>
        </div>
      </div>

      <div className="center-intro">
        <Text size="sm" c="dimmed">
          Keep shared configuration, local secrets, and runtime session state separate so the team can collaborate safely without losing fast local debugging.
        </Text>
      </div>

      <div className="environment-layout">
        <aside className="environment-sidebar">
          <div className="sidebar-section-head">
            <Text fw={700} size="sm">Environment List</Text>
            <Text size="xs" c="dimmed">Choose which named environment the workspace should use right now.</Text>
          </div>
          <div className="environment-list">
            {props.workspace.environments.map(item => {
              const mergedVarCount = Object.keys(item.document.vars || {}).length;
              const overlayCount = Object.keys(item.document.localVars || {}).length + (item.document.localHeaders || []).length;
              return (
                <button
                  key={item.document.name}
                  type="button"
                  className={item.document.name === props.activeEnvironmentName ? 'environment-item is-active' : 'environment-item'}
                  onClick={() => props.onEnvironmentChange(item.document.name)}
                >
                  <strong>{item.document.name}</strong>
                  <span>{mergedVarCount} vars · {item.document.authProfiles.length} auth profiles</span>
                  <span>{overlayCount > 0 ? `${overlayCount} local overrides` : 'No local overlay'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="environment-main">
          <section className="inspector-section">
            <div className="checks-head">
              <div>
                <Text className="section-kicker">Workspace Runtime</Text>
                <h3 className="section-title">Project-level defaults</h3>
              </div>
            </div>
            <Text size="sm" c="dimmed">
              These defaults belong to the workspace itself. They are shared infrastructure, not session state.
            </Text>
            <div className="settings-grid" style={{ marginTop: 12 }}>
              <TextInput
                label="Default Base URL"
                value={project.runtime.baseUrl}
                onChange={event =>
                  props.onProjectChange({
                    ...project,
                    runtime: {
                      ...project.runtime,
                      baseUrl: event.currentTarget.value
                    }
                  })
                }
              />
            </div>
            <KeyValueEditor
              rows={project.runtime.headers}
              onChange={rows =>
                props.onProjectChange({
                  ...project,
                  runtime: {
                    ...project.runtime,
                    headers: rows
                  }
                })
              }
              nameLabel="Header"
              valueLabel="Value"
            />
          </section>

          {selectedEnvironment ? (
            <>
              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Environment Summary</Text>
                    <h3 className="section-title">{selectedEnvironment.name}</h3>
                  </div>
                  <Badge color={hasOverlay ? 'orange' : 'gray'} variant="light">
                    {hasOverlay ? 'Has local overlay' : 'Shared only'}
                  </Badge>
                </div>
                <div className="summary-grid">
                  <div className="summary-chip">
                    <span>Shared Vars</span>
                    <strong>{sharedVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Local Vars</span>
                    <strong>{localVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Headers</span>
                    <strong>{sharedHeaderCount + localHeaderCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Auth Profiles</span>
                    <strong>{authProfileCount}</strong>
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Shared Layer</Text>
                    <h3 className="section-title">Values that can enter Git</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  Keep only safe, collaborative defaults here. Everyone sharing this workspace will see these values.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.sharedVars || selectedEnvironment.vars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.sharedHeaders || selectedEnvironment.headers}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Local Layer</Text>
                    <h3 className="section-title">Machine-only sensitive overrides</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  These values stay in `{selectedEnvironment.name}.local.yaml` and should not be committed. Use them for tokens, temp hosts, and personal overrides.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.localVars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.localHeaders || []}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Auth Profiles</Text>
                    <h3 className="section-title">Reusable environment auth</h3>
                  </div>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                        ...environment,
                        authProfiles: [
                          ...environment.authProfiles,
                          {
                            name: `profile-${environment.authProfiles.length + 1}`,
                            auth: { type: 'bearer', token: '' }
                          }
                        ]
                      }))
                    }
                  >
                    Add Profile
                  </Button>
                </div>
                <Text size="sm" c="dimmed">
                  Separate auth profiles from general variables so requests can reference a durable auth strategy instead of duplicating secret fields.
                </Text>
                {selectedEnvironment.authProfiles.length === 0 ? (
                  <div className="empty-tab-state">No auth profile yet. Add one if this environment should inject bearer, basic, API key, or OAuth credentials.</div>
                ) : (
                  <div className="checks-list">
                    {selectedEnvironment.authProfiles.map(profile => (
                      <div key={profile.name} className="check-card" style={{ margin: 0 }}>
                        <div className="settings-grid">
                          <TextInput
                            label="Profile Name"
                            value={profile.name}
                            onChange={event =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name ? { ...item, name: event.currentTarget.value } : item
                                )
                              }))
                            }
                          />
                          <Select
                            label="Auth Type"
                            value={profile.auth.type === 'inherit' ? 'none' : profile.auth.type}
                            data={authTypeOptions()}
                            onChange={value =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name
                                    ? { ...item, auth: { type: (value as AuthConfig['type']) || 'none' } }
                                    : item
                                )
                              }))
                            }
                          />
                          {profile.auth.type === 'bearer' ? (
                            <>
                              <TextInput
                                label="Bearer Token"
                                value={profile.auth.token || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, token: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Variable"
                                value={profile.auth.tokenFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'basic' ? (
                            <>
                              <TextInput
                                label="Username"
                                value={profile.auth.username || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password"
                                value={profile.auth.password || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Username Variable"
                                value={profile.auth.usernameFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, usernameFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password Variable"
                                value={profile.auth.passwordFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, passwordFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'apikey' ? (
                            <>
                              <TextInput
                                label="Key"
                                value={profile.auth.key || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, key: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value"
                                value={profile.auth.value || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, value: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value Variable"
                                value={profile.auth.valueFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, valueFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Send To"
                                value={profile.auth.addTo || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, addTo: (value as AuthConfig['addTo']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth2' ? (
                            <>
                              <Select
                                label="OAuth Flow"
                                value={profile.auth.oauthFlow || 'client_credentials'}
                                data={[
                                  { value: 'client_credentials', label: 'client_credentials' },
                                  { value: 'authorization_code', label: 'authorization_code' },
                                  { value: 'password', label: 'password' },
                                  { value: 'implicit', label: 'implicit' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              {profile.auth.oauthFlow === 'authorization_code' || profile.auth.oauthFlow === 'implicit' ? (
                                <>
                                  <TextInput
                                    label="Authorization URL"
                                    value={profile.auth.authorizationUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, authorizationUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                  <TextInput
                                    label="Callback URL"
                                    value={profile.auth.callbackUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, callbackUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                </>
                              ) : null}
                              <TextInput
                                label="Token URL"
                                value={profile.auth.tokenUrl || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenUrl: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID"
                                value={profile.auth.clientId || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientId: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID Variable"
                                value={profile.auth.clientIdFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientIdFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret"
                                value={profile.auth.clientSecret || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecret: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret Variable"
                                value={profile.auth.clientSecretFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecretFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Scope"
                                value={profile.auth.scope || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, scope: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Token Placement"
                                value={profile.auth.tokenPlacement || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPlacement: (value as AuthConfig['tokenPlacement']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Name"
                                value={profile.auth.tokenName || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenName: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Prefix"
                                value={profile.auth.tokenPrefix || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPrefix: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput label="Cached Token" value={profile.auth.accessToken || ''} readOnly />
                              <TextInput label="Cache Expires At" value={profile.auth.expiresAt || ''} readOnly />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth1' ? (
                            <>
                              <TextInput label="Consumer Key" value={profile.auth.consumerKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Consumer Secret" value={profile.auth.consumerSecret || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerSecret: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'awsv4' ? (
                            <>
                              <TextInput label="Access Key" value={profile.auth.accessKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, accessKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Secret Key" value={profile.auth.secretKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, secretKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Region" value={profile.auth.region || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, region: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Service" value={profile.auth.service || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, service: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'digest' || profile.auth.type === 'ntlm' || profile.auth.type === 'wsse' ? (
                            <>
                              <TextInput label="Username" value={profile.auth.username || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Password" value={profile.auth.password || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              {profile.auth.type === 'digest' ? (
                                <>
                                  <TextInput label="Realm" value={profile.auth.realm || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, realm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="QOP" value={profile.auth.qop || 'auth'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, qop: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Algorithm" value={profile.auth.algorithm || 'MD5'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, algorithm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Opaque" value={profile.auth.opaque || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, opaque: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Client Nonce" value={profile.auth.cnonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, cnonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce Count" value={profile.auth.nonceCount || '00000001'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonceCount: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                              {profile.auth.type === 'wsse' ? (
                                <>
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Created" value={profile.auth.created || ''} placeholder="Auto generated ISO timestamp" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, created: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Password Digest" value={profile.auth.passwordDigest || ''} placeholder="Optional override" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, passwordDigest: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <Checkbox label="Stored in the selected environment file" checked readOnly />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Runtime Layer</Text>
                    <h3 className="section-title">Current session and extracted state</h3>
                  </div>
                  <Group gap="xs">
                    <Button size="xs" variant="default" onClick={props.onClearRuntimeVars}>Clear Runtime Vars</Button>
                    <Button size="xs" variant="default" color="red" onClick={props.onClearSession}>Clear Cookie Jar</Button>
                  </Group>
                </div>
                <Text size="sm" c="dimmed">
                  Nothing below is durable workspace configuration. These values only describe the current debugging session and can be regenerated.
                </Text>
                <Text size="xs" c="dimmed" mt="sm">
                  Current target URL: {props.targetUrl || 'No active request preview yet'}
                </Text>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Runtime Vars</span>
                    <strong>{runtimeEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Cookies</span>
                    <strong>{props.sessionSnapshot?.cookies.length || 0}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Host Snapshots</span>
                    <strong>{props.hostSnapshots.length}</strong>
                  </div>
                </div>

                <div className="environment-layer-grid" style={{ marginTop: 16 }}>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Runtime Variables</Text>
                    {runtimeEntries.length === 0 ? (
                      <div className="empty-tab-state">No runtime variables yet. Extract values from responses when you want downstream requests to reuse them.</div>
                    ) : (
                      <div className="json-inspector-list" style={{ marginTop: 12 }}>
                        {runtimeEntries.map(([name, value]) => (
                          <div key={name} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{name}</strong>
                              <span>{value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Current Cookie Header</Text>
                    <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {props.sessionSnapshot?.cookieHeader || ''}
                    </Code>
                  </div>
                </div>

                {props.hostSnapshots.length > 0 ? (
                  <div className="checks-list" style={{ marginTop: 16 }}>
                    {props.hostSnapshots.map(item => (
                      <div key={item.host} className="check-card" style={{ margin: 0 }}>
                        <Text fw={700}>{item.host}</Text>
                        <Text size="xs" c="dimmed">{item.snapshot.cookies.length} cookies captured for this host</Text>
                        <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                          {item.snapshot.cookieHeader || ''}
                        </Code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="empty-tab-state">Choose an environment first. Then edit shared defaults, local overrides, auth profiles, and runtime session state from one place.</div>
          )}
        </div>
      </div>
    </section>
  );
}
