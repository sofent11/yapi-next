import { useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
  message
} from 'antd';
import {
  useGetOpenProjectInterfaceDataQuery,
  useGetLogListByUpdateMutation,
  useInterUploadMutation,
  useLazyGetLogListQuery,
  useRunOpenAutoTestMutation,
  useTestDeleteCompatMutation,
  useTestPatchCompatMutation,
  useTestPostCompatMutation,
  useTestPutCompatMutation
} from '../../services/yapi-api';
import { PageHeader, SectionCard } from '../../components/layout';
import { getRequestErrorMessage } from '../../utils/request-error';

const { Text } = Typography;

type CompatWorkspaceProps = {
  title?: string;
  description: string;
  requestSource: string;
};

function pretty(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return String(input);
  }
}

export function CompatWorkspace(props: CompatWorkspaceProps) {
  const [projectId, setProjectId] = useState<number>(11);
  const [colId, setColId] = useState<number>(12);
  const [token, setToken] = useState<string>('');
  const [apiPath, setApiPath] = useState<string>('/api/a');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [openResultText, setOpenResultText] = useState<string>('');
  const [logListText, setLogListText] = useState<string>('');
  const [logByUpdateText, setLogByUpdateText] = useState<string>('');
  const [testResultText, setTestResultText] = useState<string>('');
  const [interUploadText, setInterUploadText] = useState<string>('');
  const [interUploadMode, setInterUploadMode] = useState<'normal' | 'good' | 'merge'>('normal');
  const [interUploadJson, setInterUploadJson] = useState<string>(
    '{\n  "openapi": "3.0.0",\n  "info": { "title": "interUpload-demo", "version": "1.0.0" },\n  "paths": {\n    "/compat/upload-demo": {\n      "get": {\n        "summary": "demo",\n        "responses": {\n          "200": {\n            "description": "ok"\n          }\n        }\n      }\n    }\n  }\n}'
  );

  const openProjectDataQuery = useGetOpenProjectInterfaceDataQuery({
    projectId,
    token: token.trim() || undefined
  });
  const [runOpenAutoTest, runAutoTestState] = useRunOpenAutoTestMutation();
  const [triggerLogList, logListState] = useLazyGetLogListQuery();
  const [listByUpdate, logByUpdateState] = useGetLogListByUpdateMutation();
  const [interUpload, interUploadState] = useInterUploadMutation();
  const [testPost, testPostState] = useTestPostCompatMutation();
  const [testPut, testPutState] = useTestPutCompatMutation();
  const [testPatch, testPatchState] = useTestPatchCompatMutation();
  const [testDelete, testDeleteState] = useTestDeleteCompatMutation();
  const notifyRequestError = (error: unknown, fallback: string) => {
    message.error(getRequestErrorMessage(error, fallback));
  };

  async function handleRunAutoTest() {
    if (!token.trim()) {
      message.error('请先输入项目 token');
      return;
    }
    try {
      const response = await runOpenAutoTest({
        id: colId,
        token: token.trim(),
        mode: 'json',
        projectId
      }).unwrap();
      setOpenResultText(pretty(response));
      message.success('run_auto_test 调用完成');
    } catch (error) {
      notifyRequestError(error, 'run_auto_test 调用失败');
    }
  }

  async function handleLoadLogList() {
    try {
      const response = await triggerLogList({
        type: 'project',
        typeid: projectId,
        page: 1,
        limit: 20
      }).unwrap();
      setLogListText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'log/list 查询失败');
    }
  }

  async function handleListByUpdate() {
    try {
      const response = await listByUpdate({
        type: 'project',
        typeid: projectId,
        apis: [{ method: apiMethod, path: apiPath }]
      }).unwrap();
      setLogByUpdateText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'log/list_by_update 查询失败');
    }
  }

  async function handleInterUpload() {
    try {
      const response = await interUpload({
        project_id: projectId,
        token: token.trim() || undefined,
        type: 'swagger',
        source: 'json',
        format: 'auto',
        merge: interUploadMode,
        interfaceData: interUploadJson
      }).unwrap();
      setInterUploadText(pretty(response));
      if (response.errcode === 0) {
        message.success('interUpload 导入完成');
        return;
      }
      message.warning(response.errmsg || 'interUpload 执行失败');
    } catch (error) {
      notifyRequestError(error, 'interUpload 调用失败');
    }
  }

  async function handleTestPost() {
    try {
      const response = await testPost({ source: props.requestSource, action: 'post' }).unwrap();
      setTestResultText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'test/post 调用失败');
    }
  }

  async function handleTestPut() {
    try {
      const response = await testPut({ source: props.requestSource, action: 'put' }).unwrap();
      setTestResultText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'test/put 调用失败');
    }
  }

  async function handleTestPatch() {
    try {
      const response = await testPatch({ source: props.requestSource, action: 'patch' }).unwrap();
      setTestResultText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'test/patch 调用失败');
    }
  }

  async function handleTestDelete() {
    try {
      const response = await testDelete({ source: props.requestSource, action: 'delete' }).unwrap();
      setTestResultText(pretty(response));
    } catch (error) {
      notifyRequestError(error, 'test/delete 调用失败');
    }
  }

  const testLoading =
    testPostState.isLoading ||
    testPutState.isLoading ||
    testPatchState.isLoading ||
    testDeleteState.isLoading;

  return (
    <div className="legacy-workspace-page legacy-compat-workspace">
      <PageHeader title={props.title || 'Compat Console'} subtitle={props.description} />

      <SectionCard title="参数设置" className="legacy-workspace-card">
        <Row gutter={12}>
          <Col xs={24} md={6}>
            <Text>Project ID</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={1}
              value={projectId}
              onChange={value => setProjectId(Number(value || 0))}
            />
          </Col>
          <Col xs={24} md={6}>
            <Text>Col ID</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={1}
              value={colId}
              onChange={value => setColId(Number(value || 0))}
            />
          </Col>
          <Col xs={24} md={12}>
            <Text>Project Token</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="用于 open/run_auto_test 和 interUpload"
            />
          </Col>
        </Row>
      </SectionCard>

      <Row gutter={16} className="legacy-workspace-row">
        <Col xs={24} xl={12}>
          <SectionCard title="Open 兼容接口" className="legacy-workspace-card">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert
                showIcon
                type="info"
                message="/open/project_interface_data"
                description={openProjectDataQuery.data ? pretty(openProjectDataQuery.data) : '-'}
              />
              <Button type="primary" onClick={handleRunAutoTest} loading={runAutoTestState.isLoading}>
                调用 /open/run_auto_test (json)
              </Button>
              <Input.TextArea rows={10} readOnly value={openResultText} placeholder="run_auto_test 响应" />
            </Space>
          </SectionCard>
        </Col>
        <Col xs={24} xl={12}>
          <SectionCard title="Log 兼容接口" className="legacy-workspace-card">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Button onClick={handleLoadLogList} loading={logListState.isFetching}>
                查询 /log/list
              </Button>
              <Input.TextArea rows={6} readOnly value={logListText} placeholder="log/list 响应" />

              <Row gutter={8}>
                <Col xs={24} md={8}>
                  <Select<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>
                    style={{ width: '100%' }}
                    value={apiMethod}
                    onChange={setApiMethod}
                    options={[
                      { value: 'GET', label: 'GET' },
                      { value: 'POST', label: 'POST' },
                      { value: 'PUT', label: 'PUT' },
                      { value: 'DELETE', label: 'DELETE' },
                      { value: 'PATCH', label: 'PATCH' }
                    ]}
                  />
                </Col>
                <Col xs={24} md={16}>
                  <Input value={apiPath} onChange={event => setApiPath(event.target.value)} />
                </Col>
              </Row>

              <Button onClick={handleListByUpdate} loading={logByUpdateState.isLoading}>
                查询 /log/list_by_update
              </Button>
              <Input.TextArea rows={6} readOnly value={logByUpdateText} placeholder="log/list_by_update 响应" />
            </Space>
          </SectionCard>
        </Col>
      </Row>

      <Row gutter={16} className="legacy-workspace-row">
        <Col xs={24} xl={12}>
          <SectionCard title="Test 兼容接口" className="legacy-workspace-card">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space>
                <Button onClick={handleTestPost} loading={testLoading}>
                  POST
                </Button>
                <Button onClick={handleTestPut} loading={testLoading}>
                  PUT
                </Button>
                <Button onClick={handleTestPatch} loading={testLoading}>
                  PATCH
                </Button>
                <Button onClick={handleTestDelete} loading={testLoading}>
                  DELETE
                </Button>
              </Space>
              <Input.TextArea rows={10} readOnly value={testResultText} placeholder="test/* 响应" />
            </Space>
          </SectionCard>
        </Col>
        <Col xs={24} xl={12}>
          <SectionCard title="Interface 兼容补口" className="legacy-workspace-card">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Select<'normal' | 'good' | 'merge'>
                value={interUploadMode}
                onChange={setInterUploadMode}
                options={[
                  { value: 'normal', label: 'normal' },
                  { value: 'good', label: 'good' },
                  { value: 'merge', label: 'merge' }
                ]}
                style={{ width: 160 }}
              />
              <Input.TextArea
                rows={9}
                value={interUploadJson}
                onChange={event => setInterUploadJson(event.target.value)}
                placeholder="OpenAPI JSON"
              />
              <Button type="primary" onClick={handleInterUpload} loading={interUploadState.isLoading}>
                调用 /interface/interUpload
              </Button>
              <Input.TextArea rows={8} readOnly value={interUploadText} placeholder="interUpload 响应" />
            </Space>
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
