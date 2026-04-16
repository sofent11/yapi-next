import { Button, Checkbox, Select, Text, TextInput } from '@mantine/core';
import type { AuthConfig, EnvironmentDocument, ProjectDocument, WorkspaceIndex } from '@yapi-debugger/schema';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function authTypeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' }
  ];
}

export function EnvironmentCenterPanel(props: {
  workspace: WorkspaceIndex;
  draftProject: ProjectDocument | null;
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  onEnvironmentChange: (name: string) => void;
  onProjectChange: (project: ProjectDocument) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onAddEnvironment: () => void;
  onSave: () => void;
}) {
  const selectedEnvironment = props.selectedEnvironment;
  const project = props.draftProject || props.workspace.project;

  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{project.name}</span>
          <span className="breadcrumb-chip">Environments</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onAddEnvironment}>New Environment</Button>
          <Button size="xs" onClick={props.onSave}>Save Changes</Button>
        </div>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <Text fw={700} size="sm">Available Environments</Text>
          <div className="environment-list">
            {props.workspace.environments.map(item => (
              <button
                key={item.document.name}
                type="button"
                className={item.document.name === props.activeEnvironmentName ? 'environment-item is-active' : 'environment-item'}
                onClick={() => props.onEnvironmentChange(item.document.name)}
              >
                <strong>{item.document.name}</strong>
                <span>{Object.keys(item.document.vars).length} vars</span>
              </button>
            ))}
          </div>
        </div>

        <div className="environment-main">
          <div className="inspector-section">
            <h3 className="section-title">Workspace Runtime</h3>
            <div className="settings-grid">
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
          </div>

          {selectedEnvironment ? (
            <>
              <div className="inspector-section">
                <h3 className="section-title">Environment Variables</h3>
                <KeyValueEditor
                  rows={Object.entries(selectedEnvironment.vars).map(([name, value]) => ({ name, value, enabled: true, kind: 'text' as const }))}
                  onChange={rows =>
                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                      ...environment,
                      vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                    }))
                  }
                />
              </div>

              <div className="inspector-section">
                <h3 className="section-title">Shared Headers</h3>
                <KeyValueEditor
                  rows={selectedEnvironment.headers}
                  onChange={rows =>
                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                      ...environment,
                      headers: rows
                    }))
                  }
                />
              </div>

              <div className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">Auth Profiles</h3>
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
                {selectedEnvironment.authProfiles.length === 0 ? (
                  <div className="empty-tab-state">No auth profiles yet. Add one so requests can reference environment-level credentials.</div>
                ) : (
                  <div className="checks-list">
                    {selectedEnvironment.authProfiles.map(profile => (
                      <div key={profile.name} className="check-card">
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
                        </div>
                        <Checkbox
                          label="Keep this profile in the selected environment file"
                          checked
                          readOnly
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-tab-state">Pick an environment to start editing variables, headers and auth profiles.</div>
          )}
        </div>
      </div>
    </section>
  );
}
