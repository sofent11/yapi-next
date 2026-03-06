import { Alert, Button, Select, Text, TextInput, Textarea } from '@mantine/core';
import { IconBrush, IconCopy, IconTrash } from '@tabler/icons-react';
import { SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName } from '../../../utils/http-method';

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

function ActionGroup(props: {
  onFormat?: () => void;
  onCopy: () => void;
  onClear: () => void;
  disableCopy?: boolean;
  disableClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.onFormat ? (
        <Button size="compact-sm" variant="default" leftSection={<IconBrush size={14} />} onClick={props.onFormat}>
          格式化
        </Button>
      ) : null}
      <Button size="compact-sm" variant="default" leftSection={<IconCopy size={14} />} onClick={props.onCopy} disabled={props.disableCopy}>
        复制
      </Button>
      <Button size="compact-sm" variant="default" leftSection={<IconTrash size={14} />} onClick={props.onClear} disabled={props.disableClear}>
        清空
      </Button>
    </div>
  );
}

export function InterfaceRunTab(props: InterfaceRunTabProps) {
  const methodSelectOptions = props.runMethods.map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));

  return (
    <div className="interface-run-tab space-y-4">
      <SectionCard title="请求调试" className="interface-run-card">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select
              value={props.runMethod}
              onChange={value => props.onSetRunMethod(value || 'GET')}
              className="interface-run-method-select min-w-[120px]"
              data={methodSelectOptions}
            />
            <TextInput
              value={props.runPath}
              onChange={event => props.onSetRunPath(event.currentTarget.value)}
              className="interface-run-path-input min-w-[280px] flex-1"
              placeholder="/api/example"
            />
            <Button loading={props.runLoading} onClick={props.onRun}>
              发送请求
            </Button>
            <Button variant="default" onClick={props.onClearResponse} disabled={!props.runResponse}>
              清空响应
            </Button>
          </div>
          <Alert color="blue" title="调试请求参数需使用 JSON 格式" className="interface-run-format-alert" />
        </div>
      </SectionCard>

      <SectionCard title="请求参数" className="interface-run-card">
        <div className="interface-run-editor-grid grid gap-4 lg:grid-cols-2">
          <div className="interface-run-editor-block space-y-3">
            <div className="workspace-section-head flex flex-wrap items-center justify-between gap-3">
              <Text fw={700}>Query</Text>
              <ActionGroup onFormat={props.onFormatRunQuery} onCopy={props.onCopyRunQuery} onClear={props.onClearRunQuery} />
            </div>
            <Textarea minRows={6} autosize value={props.runQuery} onChange={event => props.onSetRunQuery(event.currentTarget.value)} />
          </div>
          <div className="interface-run-editor-block space-y-3">
            <div className="workspace-section-head flex flex-wrap items-center justify-between gap-3">
              <Text fw={700}>Headers</Text>
              <ActionGroup onFormat={props.onFormatRunHeaders} onCopy={props.onCopyRunHeaders} onClear={props.onClearRunHeaders} />
            </div>
            <Textarea minRows={6} autosize value={props.runHeaders} onChange={event => props.onSetRunHeaders(event.currentTarget.value)} />
          </div>
          <div className="interface-run-editor-block interface-run-editor-block-wide space-y-3 lg:col-span-2">
            <div className="workspace-section-head flex flex-wrap items-center justify-between gap-3">
              <Text fw={700}>Body</Text>
              <ActionGroup onFormat={props.onFormatRunBody} onCopy={props.onCopyRunBody} onClear={props.onClearRunBody} />
            </div>
            <Textarea minRows={8} autosize value={props.runBody} onChange={event => props.onSetRunBody(event.currentTarget.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="响应结果" className="interface-run-card">
        <div className="space-y-3">
          <div className="workspace-section-head flex flex-wrap items-center justify-between gap-3">
            <Text fw={700}>Response</Text>
            <ActionGroup
              onCopy={props.onCopyRunResponse}
              onClear={props.onClearResponse}
              disableCopy={!props.runResponse}
              disableClear={!props.runResponse}
            />
          </div>
          <Textarea minRows={14} autosize value={props.runResponse} readOnly placeholder="点击“发送请求”后显示结果" />
        </div>
      </SectionCard>
    </div>
  );
}
