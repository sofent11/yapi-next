import { Alert } from '@mantine/core';
import { DebugEditorPanel } from '../../../components/patterns/DebugEditorPanel';
import { DebugRequestToolbar } from '../../../components/patterns/DebugRequestToolbar';
import { SectionCard } from '../../../components/layout';

type InterfaceRunTabProps = {
  runMethod: string;
  runPath: string;
  runQuery: string;
  runHeaders: string;
  runBody: string;
  runResponse: string;
  runLoading: boolean;
  runMethods: readonly string[];
  onSetRunMethod: (value: string) => void;
  onSetRunPath: (value: string) => void;
  onSetRunQuery: (value: string) => void;
  onSetRunHeaders: (value: string) => void;
  onSetRunBody: (value: string) => void;
  onRun: () => void;
  onFormatRunQuery: () => void;
  onFormatRunHeaders: () => void;
  onFormatRunBody: () => void;
  onCopyRunQuery: () => void;
  onCopyRunHeaders: () => void;
  onCopyRunBody: () => void;
  onClearRunQuery: () => void;
  onClearRunHeaders: () => void;
  onClearRunBody: () => void;
  onCopyRunResponse: () => void;
  onClearResponse: () => void;
};

export function InterfaceRunTab(props: InterfaceRunTabProps) {
  const methodSelectOptions = props.runMethods.map(item => ({
    value: item,
    label: item
  }));

  return (
    <div className="interface-run-tab space-y-4">
      <SectionCard title="请求调试" className="interface-run-card">
        <div className="space-y-4">
          <DebugRequestToolbar
            methodValue={props.runMethod}
            methodOptions={methodSelectOptions}
            pathValue={props.runPath}
            onMethodChange={props.onSetRunMethod}
            onPathChange={props.onSetRunPath}
            onRun={props.onRun}
            runLoading={props.runLoading}
            clearAction={{
              label: '清空响应',
              onClick: props.onClearResponse,
              disabled: !props.runResponse
            }}
            className="flex flex-wrap gap-3"
            methodClassName="interface-run-method-select min-w-[120px]"
            pathClassName="interface-run-path-input min-w-[280px] flex-1"
          />
          <Alert color="blue" title="调试请求参数需使用 JSON 格式" className="interface-run-format-alert" />
        </div>
      </SectionCard>

      <SectionCard title="请求参数" className="interface-run-card">
        <div className="interface-run-editor-grid grid gap-4 lg:grid-cols-2">
          <DebugEditorPanel
            title="Query"
            value={props.runQuery}
            onChange={props.onSetRunQuery}
            onFormat={props.onFormatRunQuery}
            onCopy={props.onCopyRunQuery}
            onClear={props.onClearRunQuery}
            minRows={6}
            autosize
            className="interface-run-editor-block"
          />
          <DebugEditorPanel
            title="Headers"
            value={props.runHeaders}
            onChange={props.onSetRunHeaders}
            onFormat={props.onFormatRunHeaders}
            onCopy={props.onCopyRunHeaders}
            onClear={props.onClearRunHeaders}
            minRows={6}
            autosize
            className="interface-run-editor-block"
          />
          <DebugEditorPanel
            title="Body"
            value={props.runBody}
            onChange={props.onSetRunBody}
            onFormat={props.onFormatRunBody}
            onCopy={props.onCopyRunBody}
            onClear={props.onClearRunBody}
            minRows={8}
            autosize
            className="interface-run-editor-block interface-run-editor-block-wide lg:col-span-2"
          />
        </div>
      </SectionCard>

      <SectionCard title="响应结果" className="interface-run-card">
        <DebugEditorPanel
          title="Response"
          value={props.runResponse}
          readOnly
          minRows={14}
          autosize
          placeholder="点击“发送请求”后显示结果"
          onCopy={props.onCopyRunResponse}
          onClear={props.onClearResponse}
          disableCopy={!props.runResponse}
          disableClear={!props.runResponse}
        />
      </SectionCard>
    </div>
  );
}
