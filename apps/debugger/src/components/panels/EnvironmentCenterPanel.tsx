import { Button, Checkbox, Code, Select, Text, TextInput } from '@mantine/core';
import type { AuthConfig, EnvironmentDocument, ProjectDocument, SessionSnapshot, WorkspaceIndex } from '@yapi-debugger/schema';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function authTypeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2 client credentials' }
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

  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{project.name}</span>
          <span className="breadcrumb-chip">环境中心</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onAddEnvironment}>新建环境</Button>
          <Button size="xs" variant="default" onClick={props.onRefreshSession}>刷新会话</Button>
          <Button size="xs" onClick={props.onSave}>保存变更</Button>
        </div>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <Text fw={700} size="sm">环境列表</Text>
          <div className="environment-list">
            {props.workspace.environments.map(item => (
              <button
                key={item.document.name}
                type="button"
                className={item.document.name === props.activeEnvironmentName ? 'environment-item is-active' : 'environment-item'}
                onClick={() => props.onEnvironmentChange(item.document.name)}
              >
                <strong>{item.document.name}</strong>
                <span>{Object.keys(item.document.vars).length} 个变量</span>
              </button>
            ))}
          </div>
        </div>

        <div className="environment-main">
          <div className="inspector-section">
            <h3 className="section-title">工作区运行时</h3>
            <div className="settings-grid">
              <TextInput
                label="默认 Base URL"
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
                <h3 className="section-title">共享变量</h3>
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

              <div className="inspector-section">
                <h3 className="section-title">本地敏感变量</h3>
                <Text size="xs" c="dimmed" mb={8}>
                  会保存在 `{selectedEnvironment.name}.local.yaml` 中，默认不会进入 Git。
                </Text>
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

              <div className="inspector-section">
                <h3 className="section-title">共享请求头</h3>
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

              <div className="inspector-section">
                <h3 className="section-title">本地敏感请求头</h3>
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

              <div className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">认证配置 Profiles</h3>
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
                    添加 Profile
                  </Button>
                </div>
                {selectedEnvironment.authProfiles.length === 0 ? (
                  <div className="empty-tab-state">还没有认证配置。新增一个 Profile 后，请求就可以直接引用环境级认证。</div>
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
                                data={[{ value: 'client_credentials', label: 'client_credentials' }]}
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
                              <TextInput
                                label="Cached Token"
                                value={profile.auth.accessToken || ''}
                                readOnly
                              />
                              <TextInput
                                label="Cache Expires At"
                                value={profile.auth.expiresAt || ''}
                                readOnly
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

              <div className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">会话与运行时</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="xs" variant="default" onClick={props.onClearRuntimeVars}>清空运行时变量</Button>
                    <Button size="xs" variant="default" color="red" onClick={props.onClearSession}>清空 Cookie Jar</Button>
                  </div>
                </div>
                <Text size="xs" c="dimmed" mb={12}>
                  当前目标 URL：{props.targetUrl || '还没有选中可预览的请求'}
                </Text>
                <div className="summary-grid">
                  <div className="summary-chip">
                    <span>运行时变量</span>
                    <strong>{runtimeEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Cookies</span>
                    <strong>{props.sessionSnapshot?.cookies.length || 0}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Host 视图</span>
                    <strong>{props.hostSnapshots.length}</strong>
                  </div>
                </div>

                <div className="checks-list" style={{ marginTop: 16 }}>
                  <div className="check-card">
                    <Text fw={700}>运行时变量</Text>
                    {runtimeEntries.length === 0 ? (
                      <div className="empty-tab-state">还没有运行时变量。你可以在响应区把字段提取到运行时，供后续请求直接复用。</div>
                    ) : (
                      <div className="json-inspector-list">
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

                  <div className="check-card">
                    <Text fw={700}>当前会话 Cookie Header</Text>
                    <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {props.sessionSnapshot?.cookieHeader || ''}
                    </Code>
                  </div>
                </div>

                {props.hostSnapshots.length > 0 ? (
                  <div className="checks-list" style={{ marginTop: 16 }}>
                    {props.hostSnapshots.map(item => (
                      <div key={item.host} className="check-card">
                        <Text fw={700}>{item.host}</Text>
                        <Text size="xs" c="dimmed">{item.snapshot.cookies.length} 个 cookies</Text>
                        <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                          {item.snapshot.cookieHeader || ''}
                        </Code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-tab-state">先选择一个环境，再开始编辑变量、请求头、认证配置与会话状态。</div>
          )}
        </div>
      </div>
    </section>
  );
}
