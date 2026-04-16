import { startTransition } from 'react';
import { Badge, Button, Group, Select, SegmentedControl, Stack, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { IconCirclePlus, IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import type { CaseDocument, EnvironmentDocument, RequestDocument } from '@yapi-debugger/schema';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function caseOptions(cases: CaseDocument[]) {
  return [{ value: '__base__', label: 'Base Request' }, ...cases.map(item => ({ value: item.id, label: item.name }))];
}

export function RequestEditorPanel(props: {
  request: RequestDocument | null;
  categoryLabel: string;
  cases: CaseDocument[];
  selectedCaseId: string | null;
  environments: EnvironmentDocument[];
  activeEnvironmentName: string;
  isDirty: boolean;
  isRunning: boolean;
  onRequestChange: (request: RequestDocument) => void;
  onCaseSelect: (caseId: string | null) => void;
  onAddCase: () => void;
  onSave: () => void;
  onRun: () => void;
  onEnvironmentChange: (name: string) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
}) {
  const request = props.request;
  const selectedCase = props.cases.find(item => item.id === props.selectedCaseId) || null;

  if (!request) {
    return (
      <section className="editor-panel empty-editor">
        <Text fw={700}>Select an interface</Text>
        <Text c="dimmed">Choose an interface from the selected category, or create a new one.</Text>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <div className="editor-head">
        <div>
          <p className="eyebrow">Interface</p>
          <h2>{request.name}</h2>
          <Text c="dimmed" size="sm">
            {props.categoryLabel} / {request.path || request.url || '/'}
          </Text>
        </div>
        <Group>
          <Select
            data={props.environments.map(item => ({ value: item.name, label: item.name }))}
            value={props.activeEnvironmentName}
            onChange={value => value && props.onEnvironmentChange(value)}
          />
          <Button variant="default" leftSection={<IconCirclePlus size={16} />} onClick={props.onAddCase}>
            Add Case
          </Button>
          <Button
            color="dark"
            variant="light"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={props.onSave}
          >
            Save
          </Button>
          <Button color="dark" leftSection={<IconPlayerPlay size={16} />} loading={props.isRunning} onClick={props.onRun}>
            Run
          </Button>
        </Group>
      </div>

      <div className="editor-overview">
        <div className="editor-overview-main">
          <SegmentedControl
            value={request.method}
            data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']}
            onChange={value => props.onRequestChange({ ...request, method: value as RequestDocument['method'] })}
          />
          <TextInput
            value={request.url}
            label="Request URL"
            placeholder="{{baseUrl}}/users"
            onChange={event => props.onRequestChange({ ...request, url: event.currentTarget.value })}
          />
        </div>
        <div className="editor-overview-meta">
          <TextInput
            value={request.name}
            label="Interface Name"
            onChange={event => props.onRequestChange({ ...request, name: event.currentTarget.value })}
          />
          <TextInput
            value={request.path}
            label="Path"
            placeholder="/users/{id}"
            onChange={event => props.onRequestChange({ ...request, path: event.currentTarget.value })}
          />
        </div>
      </div>

      <div className="case-strip">
        <Select
          label="Active Case"
          value={props.selectedCaseId || '__base__'}
          data={caseOptions(props.cases)}
          onChange={value => props.onCaseSelect(value === '__base__' ? null : value)}
        />
        <Group gap="xs">
          {props.cases.map(item => (
            <Badge
              key={item.id}
              variant={item.id === props.selectedCaseId ? 'filled' : 'light'}
              color="dark"
              className="case-badge"
              onClick={() => startTransition(() => props.onCaseSelect(item.id))}
            >
              {item.name}
            </Badge>
          ))}
        </Group>
      </div>

      <Tabs defaultValue="request">
        <Tabs.List>
          <Tabs.Tab value="request">Summary</Tabs.Tab>
          <Tabs.Tab value="params">Params</Tabs.Tab>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="cases">Cases</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="request" pt="md">
          <Stack gap="lg">
            <Textarea
              label="Description"
              autosize
              minRows={3}
              value={request.description}
              onChange={event => props.onRequestChange({ ...request, description: event.currentTarget.value })}
            />
            <div className="summary-grid">
              <div className="summary-chip">
                <span>Method</span>
                <strong>{request.method}</strong>
              </div>
              <div className="summary-chip">
                <span>Environment</span>
                <strong>{props.activeEnvironmentName}</strong>
              </div>
              <div className="summary-chip">
                <span>Cases</span>
                <strong>{props.cases.length}</strong>
              </div>
              <div className="summary-chip">
                <span>Body Mode</span>
                <strong>{request.body.mode}</strong>
              </div>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="params" pt="md">
          <Stack gap="lg">
            <div className="editor-card">
              <Text fw={700}>Headers</Text>
              <KeyValueEditor
                rows={request.headers}
                onChange={rows => props.onRequestChange({ ...request, headers: rows })}
              />
            </div>
            <div className="editor-card">
              <Text fw={700}>Query</Text>
              <KeyValueEditor
                rows={request.query}
                onChange={rows => props.onRequestChange({ ...request, query: rows })}
              />
            </div>
            <div className="editor-card">
              <Text fw={700}>Path Params</Text>
              <KeyValueEditor
                rows={request.pathParams}
                onChange={rows => props.onRequestChange({ ...request, pathParams: rows })}
              />
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="body" pt="md">
          <Stack gap="md">
            <Select
              label="Body Mode"
              value={request.body.mode}
              data={[
                { value: 'none', label: 'None' },
                { value: 'json', label: 'JSON' },
                { value: 'text', label: 'Text' },
                { value: 'form-urlencoded', label: 'Form' }
              ]}
              onChange={value =>
                value &&
                props.onRequestChange({
                  ...request,
                  body: {
                    ...request.body,
                    mode: value as RequestDocument['body']['mode']
                  }
                })
              }
            />
            {request.body.mode === 'form-urlencoded' ? (
              <div className="editor-card">
                <KeyValueEditor
                  rows={request.body.fields}
                  onChange={rows =>
                    props.onRequestChange({
                      ...request,
                      body: {
                        ...request.body,
                        fields: rows
                      }
                    })
                  }
                />
              </div>
            ) : (
              <CodeEditor
                value={request.body.text}
                language={request.body.mode === 'json' ? 'json' : 'text'}
                onChange={value =>
                  props.onRequestChange({
                    ...request,
                    body: {
                      ...request.body,
                      text: value
                    }
                  })
                }
                minHeight="280px"
              />
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="cases" pt="md">
          <Stack gap="md">
            {selectedCase ? (
              <>
                <TextInput
                  label="Case Name"
                  value={selectedCase.name}
                  onChange={event =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id ? { ...item, name: event.currentTarget.value } : item
                      )
                    )
                  }
                />
                <Textarea
                  label="Notes"
                  autosize
                  minRows={2}
                  value={selectedCase.notes}
                  onChange={event =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id ? { ...item, notes: event.currentTarget.value } : item
                      )
                    )
                  }
                />
                <div className="editor-card">
                  <Text fw={700}>Override Headers</Text>
                  <KeyValueEditor
                    rows={selectedCase.overrides.headers || []}
                    onChange={rows =>
                      props.onCasesChange(
                        props.cases.map(item =>
                          item.id === selectedCase.id
                            ? { ...item, overrides: { ...item.overrides, headers: rows } }
                            : item
                        )
                      )
                    }
                  />
                </div>
                <CodeEditor
                  value={selectedCase.overrides.body?.text || ''}
                  language="json"
                  onChange={value =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id
                          ? {
                              ...item,
                              overrides: {
                                ...item.overrides,
                                body: {
                                  mode: 'json',
                                  mimeType: 'application/json',
                                  text: value,
                                  fields: []
                                }
                              }
                            }
                          : item
                      )
                    )
                  }
                />
              </>
            ) : (
              <Text c="dimmed">Select a case to edit overrides, or stay on Base Request to edit the source template.</Text>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {props.isDirty ? <div className="dirty-indicator">Unsaved changes</div> : null}
    </section>
  );
}
