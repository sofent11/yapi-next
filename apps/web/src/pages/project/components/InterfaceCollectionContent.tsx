import { Card, Loader } from '@mantine/core';
import type { FormInstance } from 'rc-field-form';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import { CaseDetailPanel } from './CaseDetailPanel';
import { CollectionOverviewPanel } from './CollectionOverviewPanel';
import type {
  AutoTestReport,
  AutoTestResultRow,
  CaseDetailData,
  CaseEditFormValues,
  CaseEnvProject,
  CollectionCaseRow,
  CollectionRow
} from './collection-types';

export type InterfaceCollectionContentProps = {
  action: string;
  projectId: number;
  selectedColId: number;
  colRows: CollectionRow[];
  canEdit: boolean;
  autoTestRunning: boolean;
  autoTestReport: AutoTestReport | null;
  autoTestRows: AutoTestResultRow[];
  caseRows: CollectionCaseRow[];
  caseListLoading: boolean;
  caseEnvProjects: CaseEnvProject[];
  selectedRunEnvByProject: Record<string, string>;
  autoTestResultMap: Map<string, AutoTestResultRow>;
  onSetRunEnv: (projectId: number, envName: string) => void;
  onOpenAddCase: () => void;
  onOpenImportInterface: () => void;
  onOpenEditCollection: (currentCol: CollectionRow | null) => void;
  onOpenCommonSetting: (currentCol: CollectionRow | null) => void;
  onRunAutoTestInCollection: () => void;
  onViewReport: () => void;
  onDownloadReport: () => void;
  onOpenReportModal: () => void;
  onOpenReportDetail: (item: AutoTestResultRow) => void;
  onNavigateCase: (caseId: string) => void;
  onRunCaseTest: (caseId: string) => void;
  onCopyCase: (caseId: string) => void;
  onDeleteCase: (caseId: string) => void;
  caseId: string;
  caseDetailLoading: boolean;
  caseDetailData: CaseDetailData;
  autoTestDetailItem: AutoTestResultRow | null;
  upColCaseLoading: boolean;
  caseForm: FormInstance<CaseEditFormValues>;
  caseEnvOptions: Array<{ label: string; value: string }>;
  runMethods: readonly string[];
  caseRunMethod: string;
  caseRunPath: string;
  caseRunQuery: string;
  caseRunHeaders: string;
  caseRunBody: string;
  caseRunResponse: string;
  caseRunLoading: boolean;
  stringifyPretty: (value: unknown) => string;
  onSetCaseRunMethod: (method: string) => void;
  onSetCaseRunPath: (value: string) => void;
  onSetCaseRunQuery: (value: string) => void;
  onSetCaseRunHeaders: (value: string) => void;
  onSetCaseRunBody: (value: string) => void;
  onFormatCaseRunQuery: () => void;
  onFormatCaseRunHeaders: () => void;
  onFormatCaseRunBody: () => void;
  onCopyCaseRunQuery: () => void;
  onCopyCaseRunHeaders: () => void;
  onCopyCaseRunBody: () => void;
  onCopyCaseRunResponse: () => void;
  onCopyCaseResult: () => void;
  onClearCaseRunQuery: () => void;
  onClearCaseRunHeaders: () => void;
  onClearCaseRunBody: () => void;
  onClearCaseRunResponse: () => void;
  onRunAutoTestInCase: () => void;
  onNavigateCollection: () => void;
  onNavigateInterface: (interfaceId: number) => void;
  onCopyCurrentCase: () => void;
  onDeleteCurrentCase: () => void;
  onSaveCase: () => void;
  onRunCaseRequest: (detail: CaseDetailData) => void;
};

export function InterfaceCollectionContent(props: InterfaceCollectionContentProps) {
  if (props.action === 'col') {
    if (props.selectedColId <= 0) {
      return <LegacyErrMsg title="请选择测试集合" desc="先在左侧选择一个测试集合。" />;
    }
    const currentCol =
      props.colRows.find(item => Number(item._id || 0) === props.selectedColId) || null;
    return (
      <CollectionOverviewPanel
        selectedColId={props.selectedColId}
        currentCol={currentCol}
        canEdit={props.canEdit}
        autoTestRunning={props.autoTestRunning}
        autoTestReport={props.autoTestReport}
        autoTestRows={props.autoTestRows}
        caseRows={props.caseRows}
        caseListLoading={props.caseListLoading}
        caseEnvProjects={props.caseEnvProjects}
        selectedRunEnvByProject={props.selectedRunEnvByProject}
        autoTestResultMap={props.autoTestResultMap}
        onSetRunEnv={props.onSetRunEnv}
        onOpenAddCase={props.onOpenAddCase}
        onOpenImportInterface={props.onOpenImportInterface}
        onOpenEditCollection={() => props.onOpenEditCollection(currentCol)}
        onOpenCommonSetting={() => props.onOpenCommonSetting(currentCol)}
        onRunAutoTest={props.onRunAutoTestInCollection}
        onViewReport={props.onViewReport}
        onDownloadReport={props.onDownloadReport}
        onOpenReportModal={props.onOpenReportModal}
        onOpenReportDetail={props.onOpenReportDetail}
        onNavigateCase={props.onNavigateCase}
        onRunCaseTest={props.onRunCaseTest}
        onCopyCase={props.onCopyCase}
        onDeleteCase={props.onDeleteCase}
      />
    );
  }

  if (!props.caseId) {
    return <LegacyErrMsg title="请选择测试用例" desc="先在左侧选择一个测试用例。" />;
  }

  if (props.caseDetailLoading) {
    return (
      <Card padding="lg" radius="lg" withBorder>
        <div className="flex justify-center py-10">
          <Loader />
        </div>
      </Card>
    );
  }

  const detail = props.caseDetailData;
  if (!detail || Object.keys(detail).length === 0) {
    return <LegacyErrMsg title="测试用例不存在" desc="该用例可能已被删除，请重新选择。" />;
  }

  const caseKey = String(props.caseId || '');
  const autoDetailKey = String(props.autoTestDetailItem?.id || '');
  const currentCaseReport =
    autoDetailKey && autoDetailKey === caseKey
      ? props.autoTestDetailItem
      : props.autoTestResultMap.get(caseKey) || null;

  return (
    <CaseDetailPanel
      projectId={props.projectId}
      detail={detail}
      canEdit={props.canEdit}
      autoTestRunning={props.autoTestRunning}
      saveLoading={props.upColCaseLoading}
      caseForm={props.caseForm}
      caseEnvOptions={props.caseEnvOptions}
      runMethods={props.runMethods}
      currentCaseReport={currentCaseReport}
      caseRunMethod={props.caseRunMethod}
      caseRunPath={props.caseRunPath}
      caseRunQuery={props.caseRunQuery}
      caseRunHeaders={props.caseRunHeaders}
      caseRunBody={props.caseRunBody}
      caseRunResponse={props.caseRunResponse}
      caseRunLoading={props.caseRunLoading}
      stringifyPretty={props.stringifyPretty}
      onSetCaseRunMethod={props.onSetCaseRunMethod}
      onSetCaseRunPath={props.onSetCaseRunPath}
      onSetCaseRunQuery={props.onSetCaseRunQuery}
      onSetCaseRunHeaders={props.onSetCaseRunHeaders}
      onSetCaseRunBody={props.onSetCaseRunBody}
      onFormatCaseRunQuery={props.onFormatCaseRunQuery}
      onFormatCaseRunHeaders={props.onFormatCaseRunHeaders}
      onFormatCaseRunBody={props.onFormatCaseRunBody}
      onCopyCaseRunQuery={props.onCopyCaseRunQuery}
      onCopyCaseRunHeaders={props.onCopyCaseRunHeaders}
      onCopyCaseRunBody={props.onCopyCaseRunBody}
      onCopyCaseRunResponse={props.onCopyCaseRunResponse}
      onCopyCaseResult={props.onCopyCaseResult}
      onClearCaseRunQuery={props.onClearCaseRunQuery}
      onClearCaseRunHeaders={props.onClearCaseRunHeaders}
      onClearCaseRunBody={props.onClearCaseRunBody}
      onClearCaseRunResponse={props.onClearCaseRunResponse}
      onRunAutoTest={props.onRunAutoTestInCase}
      onNavigateCollection={props.onNavigateCollection}
      onNavigateInterface={() => props.onNavigateInterface(Number(detail.interface_id || 0))}
      onCopyCase={props.onCopyCurrentCase}
      onDeleteCase={props.onDeleteCurrentCase}
      onSaveCase={props.onSaveCase}
      onRunCaseRequest={() => props.onRunCaseRequest(detail)}
    />
  );
}
