import type { Dispatch, SetStateAction } from 'react';

import { getHttpMethodBadgeClassName } from '../../utils/http-method';
import type { AutoTestResultModalsProps } from './components/AutoTestResultModals';
import type { CollectionModalsProps } from './components/CollectionModals';
import type { InterfaceCoreModalsProps } from './components/InterfaceCoreModals';
import { RUN_METHODS } from './ProjectInterfacePage.utils';

type BuildCoreModalsParams = {
  confirmOpen: boolean;
  cancelNavigation: () => void;
  confirmNavigation: () => void;
  addInterfaceOpen: boolean;
  addInterfaceForm: InterfaceCoreModalsProps['addInterfaceForm'];
  addInterfaceLoading: boolean;
  catRows: InterfaceCoreModalsProps['catRows'];
  setAddInterfaceOpen: (open: boolean) => void;
  handleAddNewInterface: (values: any) => void | Promise<void>;
  tagSettingOpen: boolean;
  tagSettingInput: string;
  tagSettingLoading: boolean;
  setTagSettingInput: (value: string) => void;
  setTagSettingOpen: (open: boolean) => void;
  handleSaveProjectTag: () => void | Promise<void>;
  bulkOpen: boolean;
  bulkValue: string;
  setBulkValue: (value: string) => void;
  setBulkOpen: (open: boolean) => void;
  setBulkFieldName: Dispatch<SetStateAction<'req_query' | 'req_body_form' | null>>;
  applyBulkImport: () => void;
  addCatOpen: boolean;
  addCatForm: InterfaceCoreModalsProps['addCatForm'];
  addCatLoading: boolean;
  setAddCatOpen: (open: boolean) => void;
  handleAddNewCat: (values: any) => void | Promise<void>;
  editCatOpen: boolean;
  editCatForm: InterfaceCoreModalsProps['editCatForm'];
  editCatLoading: boolean;
  setEditCatOpen: (open: boolean) => void;
  setEditingCat: (value: { _id: number; name: string; desc?: string } | null) => void;
  handleUpdateCat: (values: any) => void | Promise<void>;
};

type BuildCollectionModalsParams = {
  colModalType: CollectionModalsProps['colModalType'];
  colModalOpen: boolean;
  colForm: CollectionModalsProps['colForm'];
  colModalLoading: boolean;
  setColModalOpen: (open: boolean) => void;
  setEditingCol: (value: { _id: number; name: string; desc?: string } | null) => void;
  handleSubmitCol: (values: any) => void | Promise<void>;
  importModalOpen: boolean;
  importModalLoading: boolean;
  importProjectId: number;
  currentProjectId: number;
  importProjectOptions: CollectionModalsProps['importProjectOptions'];
  selectedImportInterfaceCount: number;
  importTableRows: CollectionModalsProps['importTableRows'];
  importTableLoading: boolean;
  importSelectedRowKeys: CollectionModalsProps['importSelectedRowKeys'];
  setImportProjectId: (value: number) => void;
  setImportSelectedRowKeys: Dispatch<SetStateAction<Array<string | number>>>;
  setImportModalOpen: (open: boolean) => void;
  handleImportInterfaces: () => void | Promise<void>;
  addCaseOpen: boolean;
  addCaseForm: CollectionModalsProps['addCaseForm'];
  addCaseLoading: boolean;
  caseInterfaceTruncated: boolean;
  caseInterfaceOptions: CollectionModalsProps['caseInterfaceOptions'];
  setAddCaseOpen: (open: boolean) => void;
  handleAddCase: (values: any) => void | Promise<void>;
  commonSettingOpen: boolean;
  commonSettingForm: CollectionModalsProps['commonSettingForm'];
  commonSettingLoading: boolean;
  setCommonSettingOpen: (open: boolean) => void;
  handleSaveCommonSetting: () => void | Promise<void>;
};

type BuildAutoTestModalsParams = {
  reportOpen: boolean;
  setReportOpen: (open: boolean) => void;
  detailItem: AutoTestResultModalsProps['detailItem'];
  setDetailItem: Dispatch<SetStateAction<AutoTestResultModalsProps['detailItem']>>;
  report: AutoTestResultModalsProps['report'];
  rows: AutoTestResultModalsProps['rows'];
};

export function buildProjectInterfaceCoreModalsProps(
  params: BuildCoreModalsParams
): InterfaceCoreModalsProps {
  return {
    confirmOpen: params.confirmOpen,
    onCancelConfirm: params.cancelNavigation,
    onConfirmLeave: params.confirmNavigation,
    addInterfaceOpen: params.addInterfaceOpen,
    addInterfaceForm: params.addInterfaceForm,
    addInterfaceLoading: params.addInterfaceLoading,
    runMethods: RUN_METHODS,
    catRows: params.catRows,
    onCancelAddInterface: () => {
      params.setAddInterfaceOpen(false);
      params.addInterfaceForm.resetFields();
    },
    onSubmitAddInterface: values => void params.handleAddNewInterface(values),
    tagSettingOpen: params.tagSettingOpen,
    tagSettingInput: params.tagSettingInput,
    tagSettingLoading: params.tagSettingLoading,
    onTagSettingInputChange: params.setTagSettingInput,
    onCancelTagSetting: () => params.setTagSettingOpen(false),
    onSaveTagSetting: () => void params.handleSaveProjectTag(),
    bulkOpen: params.bulkOpen,
    bulkValue: params.bulkValue,
    onBulkValueChange: params.setBulkValue,
    onCancelBulk: () => {
      params.setBulkOpen(false);
      params.setBulkFieldName(null);
      params.setBulkValue('');
    },
    onConfirmBulk: params.applyBulkImport,
    addCatOpen: params.addCatOpen,
    addCatForm: params.addCatForm,
    addCatLoading: params.addCatLoading,
    onCancelAddCat: () => {
      params.setAddCatOpen(false);
      params.addCatForm.resetFields();
    },
    onSubmitAddCat: values => void params.handleAddNewCat(values),
    editCatOpen: params.editCatOpen,
    editCatForm: params.editCatForm,
    editCatLoading: params.editCatLoading,
    onCancelEditCat: () => {
      params.setEditCatOpen(false);
      params.setEditingCat(null);
      params.editCatForm.resetFields();
    },
    onSubmitEditCat: values => void params.handleUpdateCat(values)
  };
}

export function buildProjectInterfaceCollectionModalsProps(
  params: BuildCollectionModalsParams
): CollectionModalsProps {
  return {
    colModalType: params.colModalType,
    colModalOpen: params.colModalOpen,
    colForm: params.colForm,
    colModalLoading: params.colModalLoading,
    onCancelColModal: () => {
      params.setColModalOpen(false);
      params.setEditingCol(null);
      params.colForm.resetFields();
    },
    onSubmitCol: values => void params.handleSubmitCol(values),
    importModalOpen: params.importModalOpen,
    importModalLoading: params.importModalLoading,
    importProjectId: params.importProjectId,
    currentProjectId: params.currentProjectId,
    importProjectOptions: params.importProjectOptions,
    selectedImportInterfaceCount: params.selectedImportInterfaceCount,
    importTableRows: params.importTableRows,
    importTableLoading: params.importTableLoading,
    importSelectedRowKeys: params.importSelectedRowKeys,
    onImportProjectChange: value => {
      params.setImportProjectId(value);
      params.setImportSelectedRowKeys([]);
    },
    onImportSelectedRowKeysChange: params.setImportSelectedRowKeys,
    onCancelImportModal: () => {
      params.setImportModalOpen(false);
      params.setImportSelectedRowKeys([]);
    },
    onConfirmImportInterfaces: () => void params.handleImportInterfaces(),
    methodClassName: getHttpMethodBadgeClassName,
    addCaseOpen: params.addCaseOpen,
    addCaseForm: params.addCaseForm,
    addCaseLoading: params.addCaseLoading,
    caseInterfaceTruncated: params.caseInterfaceTruncated,
    caseInterfaceOptions: params.caseInterfaceOptions,
    onCancelAddCase: () => {
      params.setAddCaseOpen(false);
      params.addCaseForm.resetFields();
    },
    onSubmitAddCase: values => void params.handleAddCase(values),
    commonSettingOpen: params.commonSettingOpen,
    commonSettingForm: params.commonSettingForm,
    commonSettingLoading: params.commonSettingLoading,
    onCancelCommonSetting: () => params.setCommonSettingOpen(false),
    onSaveCommonSetting: () => void params.handleSaveCommonSetting()
  };
}

export function buildProjectInterfaceAutoTestModalsProps(
  params: BuildAutoTestModalsParams
): AutoTestResultModalsProps {
  return {
    reportOpen: params.reportOpen,
    onCloseReport: () => params.setReportOpen(false),
    detailItem: params.detailItem,
    onCloseDetail: () => params.setDetailItem(null),
    report: params.report,
    rows: params.rows,
    onOpenDetail: item => params.setDetailItem(item),
    methodClassName: getHttpMethodBadgeClassName
  };
}
