import { Text } from '@mantine/core';
import type { CaseDocument, RequestDocument } from '@yapi-debugger/schema';
import { CodeEditor } from '../../editors/CodeEditor';

interface ScriptsPanelProps {
  allowCases: boolean;
  requestDocument: RequestDocument;
  selectedCase: CaseDocument | null;
  onRequestChange: (request: RequestDocument) => void;
  onCaseChange: (updater: (current: CaseDocument) => CaseDocument) => void;
}

export function ScriptsPanel({
  allowCases,
  requestDocument,
  selectedCase,
  onRequestChange,
  onCaseChange
}: ScriptsPanelProps) {
  return (
    <div className="checks-list">
      <div className="check-card">
        <Text fw={700}>Request Pre-request Script</Text>
        <CodeEditor
          value={requestDocument.scripts.preRequest || ''}
          language="text"
          onChange={value => onRequestChange({ ...requestDocument, scripts: { ...requestDocument.scripts, preRequest: value } })}
          minHeight="180px"
        />
      </div>
      <div className="check-card">
        <Text fw={700}>Request Post-response Script</Text>
        <CodeEditor
          value={requestDocument.scripts.postResponse || ''}
          language="text"
          onChange={value => onRequestChange({ ...requestDocument, scripts: { ...requestDocument.scripts, postResponse: value } })}
          minHeight="220px"
        />
      </div>
      <div className="check-card">
        <Text fw={700}>Request Tests</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Runs after the live response arrives and contributes assertion results to the response panel.
        </Text>
        <CodeEditor
          value={requestDocument.scripts.tests || ''}
          language="text"
          onChange={value => onRequestChange({ ...requestDocument, scripts: { ...requestDocument.scripts, tests: value } })}
          minHeight="180px"
        />
      </div>
      {allowCases ? (
        selectedCase ? (
          <>
            <div className="check-card">
              <Text fw={700}>Case Pre-request Script</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Runs after the request-level pre-request script for this case only.
              </Text>
              <CodeEditor
                value={selectedCase.scripts?.preRequest || ''}
                language="text"
                onChange={value =>
                  onCaseChange(current => ({
                    ...current,
                    scripts: {
                      preRequest: value,
                      postResponse: current.scripts?.postResponse || ''
                    }
                  }))
                }
                minHeight="180px"
              />
            </div>
            <div className="check-card">
              <Text fw={700}>Case Post-response Script</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Runs after the request-level post-response and tests blocks for this case only.
              </Text>
              <CodeEditor
                value={selectedCase.scripts?.postResponse || ''}
                language="text"
                onChange={value =>
                  onCaseChange(current => ({
                    ...current,
                    scripts: {
                      preRequest: current.scripts?.preRequest || '',
                      postResponse: value
                    }
                  }))
                }
                minHeight="220px"
              />
            </div>
          </>
        ) : (
          <div className="check-card">
            <Text fw={700}>Case Overrides</Text>
            <Text size="sm" c="dimmed">
              Select or create a case if this request needs extra scenario-specific scripts on top of the reusable request-level blocks.
            </Text>
          </div>
        )
      ) : (
        <div className="empty-tab-state">Scratch requests keep scripts lightweight. Save to workspace first to attach reusable scripts to a case.</div>
      )}
    </div>
  );
}
