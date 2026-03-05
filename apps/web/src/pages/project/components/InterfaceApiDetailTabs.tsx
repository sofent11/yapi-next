import { Card, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import type { TabsProps } from 'antd';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import type { InterfaceTabItem } from '../../../plugins';
import { InterfaceEditTab } from './InterfaceEditTab';
import type { InterfaceEditConflictState } from './InterfaceEditTab';
import { InterfaceRunTab } from './InterfaceRunTab';
import { InterfaceViewTab } from './InterfaceViewTab';

type InterfaceApiDetailTabsProps = {
  projectId: number;
  currentInterface: LegacyInterfaceDTO;
  tab: string;
  interfaceTabs: Record<string, InterfaceTabItem>;
  onSwitchTab: (next: string) => void;
  method: string;
  fullPath: string;
  mockUrl: string;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
  reqParamsRows: Array<Record<string, unknown>>;
  reqHeadersRows: Array<Record<string, unknown>>;
  reqQueryRows: Array<Record<string, unknown>>;
  reqBodyFormRows: Array<Record<string, unknown>>;
  schemaRowsRequest: Array<Record<string, unknown>>;
  schemaRowsResponse: Array<Record<string, unknown>>;
  paramColumns: Array<Record<string, unknown>>;
  bodyParamColumns: Array<Record<string, unknown>>;
  schemaColumns: Array<Record<string, unknown>>;
  methodClassName: (method?: string) => string;
  statusLabel: (status?: string) => string;
  formatUnixTime: (value: unknown) => string;
  mockFlagText: (mockOpen?: boolean, strict?: boolean) => string;
  onCopyText: (text: string, successText: string) => void;
  editConflictState: InterfaceEditConflictState;
  form: FormInstance;
  catRows: Array<{ _id: number; name: string }>;
  runMethods: readonly string[];
  supportsRequestBody: (method?: string) => boolean;
  reqRadioType: 'req-query' | 'req-body' | 'req-headers';
  onReqRadioTypeChange: (value: 'req-query' | 'req-body' | 'req-headers') => void;
  basepath?: string;
  normalizePathInput: (input: string | undefined) => string;
  projectTagOptions: Array<{ label: string; value: string }>;
  onOpenTagSetting: () => void;
  sanitizeReqQuery: (input: unknown) => unknown;
  sanitizeReqHeaders: (input: unknown) => unknown;
  sanitizeReqBodyForm: (input: unknown) => unknown;
  onOpenBulkImport: (field: 'req_query' | 'req_body_form') => void;
  httpRequestHeaders: string[];
  editBodyType: string;
  projectIsJson5?: boolean;
  reqSchemaEditorMode: 'text' | 'visual';
  onReqSchemaEditorModeChange: (mode: 'text' | 'visual') => void;
  watchedReqBodyOther: string;
  editValues: Record<string, unknown>;
  resEditorTab: 'tpl' | 'preview';
  onResponseEditorTabChange: (tab: 'tpl' | 'preview') => void;
  resSchemaEditorMode: 'text' | 'visual';
  onResSchemaEditorModeChange: (mode: 'text' | 'visual') => void;
  watchedResBody: string;
  resPreviewText: string;
  onSave: () => void;
  saving: boolean;
  runMethod: string;
  runPath: string;
  runQuery: string;
  runHeaders: string;
  runBody: string;
  runResponse: string;
  runLoading: boolean;
  onSetRunMethod: (method: string) => void;
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

export function InterfaceApiDetailTabs(props: InterfaceApiDetailTabsProps) {
  const items: TabsProps['items'] = Object.keys(props.interfaceTabs).flatMap(key => {
    const tabItem = props.interfaceTabs[key];
    if (key === 'view') {
      return [{
        key,
        label: tabItem.name,
        children: (
          <InterfaceViewTab
            currentInterface={props.currentInterface}
            method={props.method}
            fullPath={props.fullPath}
            mockUrl={props.mockUrl}
            projectIsMockOpen={props.projectIsMockOpen}
            projectStrict={props.projectStrict}
            customField={props.customField}
            reqParamsRows={props.reqParamsRows}
            reqHeadersRows={props.reqHeadersRows}
            reqQueryRows={props.reqQueryRows}
            reqBodyFormRows={props.reqBodyFormRows}
            schemaRowsRequest={props.schemaRowsRequest}
            schemaRowsResponse={props.schemaRowsResponse}
            paramColumns={props.paramColumns}
            bodyParamColumns={props.bodyParamColumns}
            schemaColumns={props.schemaColumns}
            methodClassName={props.methodClassName}
            statusLabel={props.statusLabel}
            formatUnixTime={props.formatUnixTime}
            mockFlagText={props.mockFlagText}
            onCopyText={props.onCopyText}
          />
        )
      }];
    }
    if (key === 'edit') {
      return [{
        key,
        label: tabItem.name,
        children: (
          <InterfaceEditTab
            editConflictState={props.editConflictState}
            form={props.form}
            catRows={props.catRows}
            runMethods={props.runMethods}
            supportsRequestBody={props.supportsRequestBody}
            reqRadioType={props.reqRadioType}
            onReqRadioTypeChange={props.onReqRadioTypeChange}
            basepath={props.basepath}
            normalizePathInput={props.normalizePathInput}
            projectTagOptions={props.projectTagOptions}
            onOpenTagSetting={props.onOpenTagSetting}
            customField={props.customField}
            sanitizeReqQuery={props.sanitizeReqQuery}
            sanitizeReqHeaders={props.sanitizeReqHeaders}
            sanitizeReqBodyForm={props.sanitizeReqBodyForm}
            onOpenBulkImport={props.onOpenBulkImport}
            httpRequestHeaders={props.httpRequestHeaders}
            editBodyType={props.editBodyType}
            projectIsJson5={props.projectIsJson5}
            reqSchemaEditorMode={props.reqSchemaEditorMode}
            onReqSchemaEditorModeChange={props.onReqSchemaEditorModeChange}
            watchedReqBodyOther={props.watchedReqBodyOther}
            editValues={props.editValues}
            resEditorTab={props.resEditorTab}
            onResponseEditorTabChange={props.onResponseEditorTabChange}
            resSchemaEditorMode={props.resSchemaEditorMode}
            onResSchemaEditorModeChange={props.onResSchemaEditorModeChange}
            watchedResBody={props.watchedResBody}
            resPreviewText={props.resPreviewText}
            onSave={props.onSave}
            saving={props.saving}
          />
        )
      }];
    }
    if (key === 'run') {
      return [{
        key,
        label: tabItem.name,
        children: (
          <InterfaceRunTab
            runMethod={props.runMethod}
            runPath={props.runPath}
            runQuery={props.runQuery}
            runHeaders={props.runHeaders}
            runBody={props.runBody}
            runResponse={props.runResponse}
            runLoading={props.runLoading}
            runMethods={props.runMethods}
            onSetRunMethod={props.onSetRunMethod}
            onSetRunPath={props.onSetRunPath}
            onSetRunQuery={props.onSetRunQuery}
            onSetRunHeaders={props.onSetRunHeaders}
            onSetRunBody={props.onSetRunBody}
            onRun={props.onRun}
            onFormatRunQuery={props.onFormatRunQuery}
            onFormatRunHeaders={props.onFormatRunHeaders}
            onFormatRunBody={props.onFormatRunBody}
            onCopyRunQuery={props.onCopyRunQuery}
            onCopyRunHeaders={props.onCopyRunHeaders}
            onCopyRunBody={props.onCopyRunBody}
            onClearRunQuery={props.onClearRunQuery}
            onClearRunHeaders={props.onClearRunHeaders}
            onClearRunBody={props.onClearRunBody}
            onCopyRunResponse={props.onCopyRunResponse}
            onClearResponse={props.onClearResponse}
          />
        )
      }];
    }
    const CustomTab = tabItem.component;
    if (!CustomTab) return [];
    return [{
      key,
      label: tabItem.name,
      children: (
        <CustomTab
          projectId={props.projectId}
          interfaceData={props.currentInterface as unknown as Record<string, unknown>}
        />
      )
    }];
  });

  return (
    <Card>
      <Tabs
        type="card"
        className="legacy-interface-content-tabs"
        activeKey={props.tab}
        onChange={key => props.onSwitchTab(key)}
        items={items}
      />
    </Card>
  );
}
