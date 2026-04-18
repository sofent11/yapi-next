import { Badge, Button, Code, Text } from '@mantine/core';
import type { SessionSnapshot, WorkspaceIndex } from '@yapi-debugger/schema';

export function SessionCenterPanel(props: {
  workspace: WorkspaceIndex;
  activeEnvironmentName: string;
  runtimeVariables: Record<string, string>;
  sessionSnapshot: SessionSnapshot | null;
  hostSnapshots: Array<{ host: string; snapshot: SessionSnapshot }>;
  targetUrl: string | null;
  onRefresh: () => void;
  onClearSession: () => void;
  onClearRuntimeVars: () => void;
}) {
  const runtimeEntries = Object.entries(props.runtimeVariables);
  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{props.workspace.project.name}</span>
          <span className="breadcrumb-chip">Session Center</span>
          <span className="breadcrumb-chip">{props.activeEnvironmentName}</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onRefresh}>Refresh</Button>
          <Button size="xs" variant="default" color="red" onClick={props.onClearRuntimeVars}>Clear Runtime Vars</Button>
          <Button size="xs" color="red" onClick={props.onClearSession}>Clear Cookie Jar</Button>
        </div>
      </div>

      <div className="session-center-layout">
        <div className="environment-main">
          <div className="inspector-section">
            <h3 className="section-title">Current Session</h3>
            <Text size="sm" c="dimmed">
              Target URL: {props.targetUrl || 'No active request preview selected'}
            </Text>
            <div className="summary-grid" style={{ marginTop: 12 }}>
              <div className="summary-chip">
                <span>Cookies</span>
                <strong>{props.sessionSnapshot?.cookies.length || 0}</strong>
              </div>
              <div className="summary-chip">
                <span>Hosts</span>
                <strong>{props.hostSnapshots.length}</strong>
              </div>
              <div className="summary-chip">
                <span>Runtime Vars</span>
                <strong>{runtimeEntries.length}</strong>
              </div>
            </div>
          </div>

          <div className="response-cookie-grid">
            <div className="check-card">
              <Text fw={700}>Cookie Jar</Text>
              {props.sessionSnapshot?.cookies.length ? (
                <div className="json-inspector-list">
                  {props.sessionSnapshot.cookies.map(cookie => (
                    <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                      <div className="json-inspector-copy">
                        <strong>{cookie.name}</strong>
                        <span>{cookie.value}</span>
                      </div>
                      <Badge variant="light">cookie</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-tab-state">No cookies are currently stored for the active request URL.</div>
              )}
              <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                {props.sessionSnapshot?.cookieHeader || ''}
              </Code>
            </div>

            <div className="check-card">
              <Text fw={700}>Runtime Variables</Text>
              {runtimeEntries.length ? (
                <div className="json-inspector-list">
                  {runtimeEntries.map(([name, value]) => (
                    <div key={name} className="json-inspector-row">
                      <div className="json-inspector-copy">
                        <strong>{name}</strong>
                        <span>{value}</span>
                      </div>
                      <Badge variant="light" color="indigo">runtime</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-tab-state">No runtime variables captured yet. Extract values from a response or set them via scripts.</div>
              )}
            </div>
          </div>

          <div className="inspector-section">
            <h3 className="section-title">Per-Host Cookie Visibility</h3>
            {props.hostSnapshots.length ? (
              <div className="checks-list">
                {props.hostSnapshots.map(item => (
                  <div key={item.host} className="check-card">
                    <Text fw={700}>{item.host}</Text>
                    <Text size="xs" c="dimmed">{item.snapshot.cookies.length} cookies</Text>
                    <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {item.snapshot.cookieHeader || ''}
                    </Code>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-tab-state">No host-specific cookie views are available yet. Run requests against one or more hosts first.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
