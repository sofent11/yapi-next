import { useRef } from 'react';
import { Badge, Button } from '@mantine/core';
import { IconDeviceFloppy, IconPlus } from '@tabler/icons-react';
import type {
  CheckResult,
  EnvironmentDocument,
  RequestDocument,
  ResolvedRequestInsight,
  ResolvedRequestPreview,
  ScriptLog,
  SendRequestResult,
  SessionSnapshot,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab, ResponseTab } from '../../store/workspace-store';
import { Resizer } from '../primitives/Resizer';
import { RequestPanel } from './RequestPanel';
import { ResponsePanel } from './ResponsePanel';

export function ScratchPadPanel(props: {
  workspace: WorkspaceIndex;
  request: RequestDocument;
  response: SendRequestResult | null;
  requestError: string | null;
  requestInsight: ResolvedRequestInsight | null;
  requestPreview: ResolvedRequestPreview | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  sessionSnapshot: SessionSnapshot | null;
  selectedEnvironment: EnvironmentDocument | null;
  selectedExampleName: string | null;
  activeRequestTab: RequestTab;
  activeResponseTab: ResponseTab | 'json' | 'cookies' | 'compare';
  mainSplitRatio: number;
  isRunning: boolean;
  isDirty: boolean;
  onRequestChange: (request: RequestDocument) => void;
  onRun: () => void;
  onSaveToWorkspace: () => void;
  onNewScratch: () => void;
  onRequestTabChange: (tab: RequestTab) => void;
  onResponseTabChange: (tab: ResponseTab | 'json' | 'cookies' | 'compare') => void;
  onSelectExample: (name: string | null) => void;
  onSaveExample: () => void;
  onReplaceExample: () => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCaseFromResponse: () => void;
  onCreateCheck: (input: any) => void;
  onMainSplitRatioChange: (ratio: number) => void;
  onSaveAuthProfile?: (name: string, auth: any) => void;
  onExtractValue?: (target: 'local' | 'runtime', input: { suggestedName: string; value: string }) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="workspace-main">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Scratch</span>
          <span className="breadcrumb-chip">Temporary Request</span>
        </div>
        <div className="panel-toolbar-actions">
          {props.isDirty && <Badge color="orange" variant="filled" size="xs">Unsaved</Badge>}
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={props.onNewScratch}>
            New Scratch
          </Button>
          <Button size="xs" variant="filled" leftSection={<IconDeviceFloppy size={14} />} onClick={props.onSaveToWorkspace}>
            Save To Workspace
          </Button>
        </div>
      </div>

      <div
        ref={splitRef}
        className="workbench-split"
        style={{
          gridTemplateColumns: `minmax(0, ${props.mainSplitRatio}fr) auto minmax(320px, ${1 - props.mainSplitRatio}fr)`
        }}
      >
        <div className="pane-surface">
          <RequestPanel
            workspace={props.workspace}
            selectedEnvironment={props.selectedEnvironment}
            request={props.request}
            selectedCase={null}
            requestInsight={props.requestInsight}
            sessionSnapshot={props.sessionSnapshot}
            activeTab={props.activeRequestTab}
            isRunning={props.isRunning}
            isDirty={props.isDirty}
            cases={[]}
            allowCases={false}
            onTabChange={props.onRequestTabChange}
            onRequestChange={props.onRequestChange}
            onCasesChange={() => undefined}
            onAddCase={() => undefined}
            onRun={props.onRun}
            onSaveAuthProfile={props.onSaveAuthProfile}
            onCopyText={() => undefined}
          />
        </div>

        <Resizer
          containerRef={splitRef}
          onResizeRatio={props.onMainSplitRatioChange}
          minRatio={0.3}
          maxRatio={0.7}
        />

        <div className="pane-surface">
          <ResponsePanel
            response={props.response}
            requestError={props.requestError}
            requestPreview={props.requestPreview}
            requestDocument={props.request}
            checkResults={props.checkResults}
            scriptLogs={props.scriptLogs}
            sessionSnapshot={props.sessionSnapshot}
            selectedExampleName={props.selectedExampleName}
            activeTab={props.activeResponseTab}
            onTabChange={props.onResponseTabChange}
            onSelectExample={props.onSelectExample}
            onCopyBody={props.onCopyBody}
            onCopyCurl={props.onCopyCurl}
            onSaveExample={props.onSaveExample}
            onReplaceExample={props.onReplaceExample}
            onRefreshSession={props.onRefreshSession}
            onClearSession={props.onClearSession}
            onCreateCheck={props.onCreateCheck}
            onCreateCaseFromResponse={props.onCreateCaseFromResponse}
            onExtractValue={props.onExtractValue}
          />
        </div>
      </div>
    </section>
  );
}
