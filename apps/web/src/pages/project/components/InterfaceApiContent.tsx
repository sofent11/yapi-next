import { Card } from 'antd';
import type { FormInstance } from 'antd';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import type { InterfaceTabItem } from '../../../plugins';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import { InterfaceApiDetailTabs } from './InterfaceApiDetailTabs';
import type { InterfaceEditConflictState } from './InterfaceEditTab';
import { InterfaceListPanel } from './InterfaceListPanel';

type InterfaceApiContentProps = {
  projectId: number;
  interfaceId: number;
  detailLoading: boolean;
  currentInterface: LegacyInterfaceDTO | null;
  basepath?: string;
  canEdit: boolean;
  currentCat: { _id?: number; name?: string; desc?: string } | null;
  currentCatName: string;
  filteredList: LegacyInterfaceDTO[];
  currentListLoading: boolean;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  listPage: number;
  catOptions: Array<{ label: string; value: number }>;
  hasCategories: boolean;
  onListKeywordChange: (value: string) => void;
  onStatusFilterChange: (value: 'all' | 'done' | 'undone') => void;
  onResetFilters: () => void;
  onListPageChange: (page: number) => void;
  onOpenAddInterface: () => void;
  onOpenAddCat: () => void;
  onOpenEditCat: (cat?: { _id?: number; name?: string; desc?: string } | null) => void;
  onNavigateInterface: (id: number) => void;
  onUpdateStatus: (id: number, status: 'done' | 'undone') => Promise<void>;
  onUpdateCategory: (id: number, catid: number) => Promise<void>;
  onCopyInterface: (row: LegacyInterfaceDTO) => void;
  onDeleteInterface: (id: number) => void;
  methodClassName: (method?: string) => string;
  tab: string;
  interfaceTabs: Record<string, InterfaceTabItem>;
  onSwitchTab: (next: string) => void;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
  normalizeParamRows: (input: unknown) => Array<Record<string, unknown>>;
  buildSchemaRows: (schemaText: string) => Array<Record<string, unknown>>;
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
  normalizePathInput: (input: string | undefined) => string;
  projectTagOptions: Array<{ label: string; value: string }>;
  onOpenTagSetting: () => void;
  sanitizeReqQuery: (input: unknown) => Array<Record<string, unknown>>;
  sanitizeReqHeaders: (input: unknown) => Array<Record<string, unknown>>;
  sanitizeReqBodyForm: (input: unknown) => Array<Record<string, unknown>>;
  onOpenBulkImport: (field: 'req_query' | 'req_body_form') => void;
  httpRequestHeaders: string[];
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

export function InterfaceApiContent(props: InterfaceApiContentProps) {
  if (props.interfaceId <= 0) {
    return (
      <Card>
        <InterfaceListPanel
          basepath={props.basepath}
          canEdit={props.canEdit}
          activeInterfaceId={props.interfaceId}
          currentCat={props.currentCat as any}
          currentCatName={props.currentCatName}
          filteredList={props.filteredList}
          currentListLoading={props.currentListLoading}
          listKeyword={props.listKeyword}
          statusFilter={props.statusFilter}
          listPage={props.listPage}
          catOptions={props.catOptions}
          hasCategories={props.hasCategories}
          onListKeywordChange={props.onListKeywordChange}
          onStatusFilterChange={props.onStatusFilterChange}
          onResetFilters={props.onResetFilters}
          onListPageChange={props.onListPageChange}
          onOpenAddInterface={props.onOpenAddInterface}
          onOpenAddCat={props.onOpenAddCat}
          onOpenEditCat={() => props.onOpenEditCat(props.currentCat)}
          onNavigateInterface={props.onNavigateInterface}
          onUpdateStatus={props.onUpdateStatus}
          onUpdateCategory={props.onUpdateCategory}
          onCopyInterface={props.onCopyInterface}
          onDeleteInterface={props.onDeleteInterface}
          methodClassName={props.methodClassName}
        />
      </Card>
    );
  }

  if (props.detailLoading) {
    return <Card loading />;
  }

  if (!props.currentInterface) {
    return <LegacyErrMsg type="noInterface" />;
  }

  const method = String(props.currentInterface.method || 'GET').toUpperCase();
  const fullPath = `${props.basepath || ''}${props.currentInterface.path || ''}`;
  const editBodyType = String(props.editValues.req_body_type || 'form');
  const mockUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.protocol}//${window.location.host}/mock/${props.projectId}${fullPath}`;
  const reqParamsRows = props.normalizeParamRows(props.currentInterface.req_params);
  const reqHeadersRows = props.normalizeParamRows(props.currentInterface.req_headers);
  const reqQueryRows = props.normalizeParamRows(props.currentInterface.req_query);
  const reqBodyFormRows = props.normalizeParamRows(props.currentInterface.req_body_form);
  const paramColumns = [
    { title: '参数名称', dataIndex: 'name', key: 'name', width: 180 },
    { title: '是否必须', dataIndex: 'required', key: 'required', width: 120 },
    { title: '示例', dataIndex: 'example', key: 'example', width: 180 },
    {
      title: '备注',
      dataIndex: 'desc',
      key: 'desc',
      render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
    }
  ];
  const bodyParamColumns = [
    { title: '参数名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '参数类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (value: string) => (value ? value : '-')
    },
    { title: '是否必须', dataIndex: 'required', key: 'required', width: 120 },
    { title: '示例', dataIndex: 'example', key: 'example', width: 180 },
    {
      title: '备注',
      dataIndex: 'desc',
      key: 'desc',
      render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
    }
  ];
  const schemaRowsRequest =
    String(props.currentInterface.req_body_type || '').toLowerCase() === 'json' &&
    props.currentInterface.req_body_is_json_schema
      ? props.buildSchemaRows(String(props.currentInterface.req_body_other || ''))
      : [];
  const schemaRowsResponse =
    String(props.currentInterface.res_body_type || 'json').toLowerCase() === 'json' &&
    props.currentInterface.res_body_is_json_schema
      ? props.buildSchemaRows(String(props.currentInterface.res_body || ''))
      : [];
  const schemaColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 220 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
    { title: '是否必须', dataIndex: 'required', key: 'required', width: 100 },
    { title: '默认值', dataIndex: 'defaultValue', key: 'defaultValue', width: 140 },
    {
      title: '备注',
      dataIndex: 'desc',
      key: 'desc',
      render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
    },
    {
      title: '其他信息',
      dataIndex: 'other',
      key: 'other',
      render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
    }
  ];

  return (
    <InterfaceApiDetailTabs
      projectId={props.projectId}
      currentInterface={props.currentInterface}
      tab={props.tab}
      interfaceTabs={props.interfaceTabs}
      onSwitchTab={props.onSwitchTab}
      method={method}
      fullPath={fullPath}
      mockUrl={mockUrl}
      projectIsMockOpen={props.projectIsMockOpen}
      projectStrict={props.projectStrict}
      customField={props.customField}
      reqParamsRows={reqParamsRows}
      reqHeadersRows={reqHeadersRows}
      reqQueryRows={reqQueryRows}
      reqBodyFormRows={reqBodyFormRows}
      schemaRowsRequest={schemaRowsRequest}
      schemaRowsResponse={schemaRowsResponse}
      paramColumns={paramColumns}
      bodyParamColumns={bodyParamColumns}
      schemaColumns={schemaColumns}
      methodClassName={props.methodClassName}
      statusLabel={props.statusLabel}
      formatUnixTime={props.formatUnixTime}
      mockFlagText={props.mockFlagText}
      onCopyText={props.onCopyText}
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
      sanitizeReqQuery={props.sanitizeReqQuery}
      sanitizeReqHeaders={props.sanitizeReqHeaders}
      sanitizeReqBodyForm={props.sanitizeReqBodyForm}
      onOpenBulkImport={props.onOpenBulkImport}
      httpRequestHeaders={props.httpRequestHeaders}
      editBodyType={editBodyType}
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
      runMethod={props.runMethod}
      runPath={props.runPath}
      runQuery={props.runQuery}
      runHeaders={props.runHeaders}
      runBody={props.runBody}
      runResponse={props.runResponse}
      runLoading={props.runLoading}
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
  );
}
