import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import type { FormInstance } from 'rc-field-form';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';

import {
  stringifyPretty,
  type ProjectInterfaceRequestRunnerState
} from './ProjectInterfacePage.request-runner';
import type { AutoTestResultItem, EditForm, ProjectInterfacePageProps } from './ProjectInterfacePage.types';
import {
  buildReqParamsByPath,
  safeStringArray,
  sanitizeReqBodyForm,
  sanitizeReqHeaders,
  sanitizeReqParams,
  sanitizeReqQuery
} from './ProjectInterfacePage.utils';

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  warning(text: string) {
    notifications.show({ color: 'yellow', message: text });
  }
};

type UseProjectInterfaceEditHelpersParams = {
  props: ProjectInterfacePageProps;
  catRows: Array<{ _id: number; name: string; desc?: string }>;
};

export function useProjectInterfaceEditHelpers(params: UseProjectInterfaceEditHelpersParams) {
  const serializeEditValues = useCallback((values: EditForm | undefined): string => {
    const v = values || ({} as EditForm);
    const data = {
      catid: Number(v.catid || 0),
      title: String(v.title || ''),
      path: String(v.path || ''),
      method: String(v.method || '').toUpperCase(),
      status: String(v.status || 'undone'),
      tag: safeStringArray(v.tag),
      custom_field_value: String(v.custom_field_value || ''),
      req_query: sanitizeReqQuery(v.req_query),
      req_headers: sanitizeReqHeaders(v.req_headers),
      req_params: sanitizeReqParams(v.req_params),
      req_body_type: String(v.req_body_type || 'form'),
      req_body_form: sanitizeReqBodyForm(v.req_body_form),
      req_body_other: String(v.req_body_other || ''),
      req_body_is_json_schema: v.req_body_is_json_schema === true,
      res_body_type: String(v.res_body_type || 'json'),
      res_body: String(v.res_body || ''),
      res_body_is_json_schema: v.res_body_is_json_schema === true,
      desc: String(v.desc || ''),
      switch_notice: v.switch_notice === true,
      api_opened: v.api_opened === true
    };
    return JSON.stringify(data);
  }, []);

  const buildEditFormValues = useCallback((source: LegacyInterfaceDTO | null): EditForm => {
    if (!source) {
      return {
        catid: Number(params.catRows[0]?._id || 0),
        title: '',
        path: '',
        method: 'GET',
        status: 'undone',
        tag: [],
        custom_field_value: '',
        req_query: [],
        req_headers: [],
        req_params: [],
        req_body_type: 'form',
        req_body_form: [],
        req_body_other: '',
        req_body_is_json_schema: !params.props.projectIsJson5,
        res_body_type: 'json',
        res_body: '',
        res_body_is_json_schema: !params.props.projectIsJson5,
        desc: '',
        switch_notice: params.props.projectSwitchNotice === true,
        api_opened: false
      };
    }

    const method = String(source.method || 'GET').toUpperCase();
    const path = String(source.path || '');
    const reqParams = sanitizeReqParams(source.req_params);
    const mergedReqParams = buildReqParamsByPath(path, reqParams);

    return {
      catid: Number(source.catid || params.catRows[0]?._id || 0),
      title: String(source.title || ''),
      path,
      method,
      status: String(source.status || 'undone') === 'done' ? 'done' : 'undone',
      tag: safeStringArray(source.tag),
      custom_field_value: String(source.custom_field_value || ''),
      req_query: sanitizeReqQuery(source.req_query),
      req_headers: sanitizeReqHeaders(source.req_headers),
      req_params: mergedReqParams,
      req_body_type: (['form', 'json', 'file', 'raw'].includes(String(source.req_body_type || ''))
        ? String(source.req_body_type || 'form')
        : 'form') as 'form' | 'json' | 'file' | 'raw',
      req_body_form: sanitizeReqBodyForm(source.req_body_form),
      req_body_other: String(source.req_body_other || ''),
      req_body_is_json_schema:
        source.req_body_is_json_schema === true || (params.props.projectIsJson5 ? false : true),
      res_body_type:
        String(source.res_body_type || 'json').toLowerCase() === 'raw' ? 'raw' : 'json',
      res_body: String(source.res_body || ''),
      res_body_is_json_schema:
        source.res_body_is_json_schema === true || (params.props.projectIsJson5 ? false : true),
      desc: String(source.desc || ''),
      switch_notice: params.props.projectSwitchNotice === true,
      api_opened: source.api_opened === true
    };
  }, [params.catRows, params.props.projectIsJson5, params.props.projectSwitchNotice]);

  return {
    serializeEditValues,
    buildEditFormValues
  };
}

type UseProjectInterfaceRunHelpersParams = {
  currentInterface: LegacyInterfaceDTO | null;
  projectId: number;
  caseId: string;
  caseForm: FormInstance<any>;
  interfaceRequestRunner: ProjectInterfaceRequestRunnerState;
  caseRequestRunner: ProjectInterfaceRequestRunnerState;
  autoTestDetailItem: AutoTestResultItem | null;
  autoTestResultMap: Map<string, AutoTestResultItem>;
};

export function useProjectInterfaceRunHelpers(params: UseProjectInterfaceRunHelpersParams) {
  const copyText = useCallback(async (text: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (!params.currentInterface) {
      message.error('请先选择接口');
      return;
    }
    const currentInterfaceId = Number(params.currentInterface._id || 0);
    await params.interfaceRequestRunner.run({
      interfaceId: currentInterfaceId,
      requestMeta: {
        type: 'inter',
        projectId: params.projectId,
        interfaceId: currentInterfaceId
      }
    });
  }, [params]);

  const handleRunCaseRequest = useCallback(async (detail: any) => {
    const bodyType = String(params.caseForm.getFieldValue('req_body_type') || detail.req_body_type || 'form').toLowerCase();
    const interfaceId = Number(detail.interface_id || detail.interfaceId || 0);
    await params.caseRequestRunner.run({
      interfaceId,
      requestMeta: {
        type: 'case',
        projectId: params.projectId,
        interfaceId,
        caseId: params.caseId
      },
      bodyMode: bodyType === 'raw' || bodyType === 'file' ? 'raw' : 'json'
    });
  }, [params]);

  const getCurrentCaseReportById = useCallback((targetCaseId: string): AutoTestResultItem | null => {
    const caseKey = String(targetCaseId || '');
    if (!caseKey) return null;
    if (String(params.autoTestDetailItem?.id || '') === caseKey) return params.autoTestDetailItem;
    return params.autoTestResultMap.get(caseKey) || null;
  }, [params.autoTestDetailItem, params.autoTestResultMap]);

  const handleCopyCaseResult = useCallback((targetCaseId: string) => {
    const report = getCurrentCaseReportById(targetCaseId);
    if (!report) {
      message.warning('暂无测试结果可复制');
      return;
    }
    void copyText(stringifyPretty(report), '测试结果已复制');
  }, [copyText, getCurrentCaseReportById]);

  return {
    copyText,
    handleRun,
    handleRunCaseRequest,
    handleCopyCaseResult
  };
}
