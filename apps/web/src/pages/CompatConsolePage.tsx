import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
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
  useLazyRunOpenAutoTestQuery,
  useTestDeleteCompatMutation,
  useTestPatchCompatMutation,
  useTestPostCompatMutation,
  useTestPutCompatMutation
} from '../services/yapi-api';

const { Paragraph } = Typography;

function pretty(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return String(input);
  }
}

export function CompatConsolePage() {
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

  const [triggerRunAutoTest, runAutoTestState] = useLazyRunOpenAutoTestQuery();
  const [triggerLogList, logListState] = useLazyGetLogListQuery();
  const [listByUpdate, logByUpdateState] = useGetLogListByUpdateMutation();
  const [interUpload, interUploadState] = useInterUploadMutation();
  const [testPost, testPostState] = useTestPostCompatMutation();
  const [testPut, testPutState] = useTestPutCompatMutation();
  const [testPatch, testPatchState] = useTestPatchCompatMutation();
  const [testDelete, testDeleteState] = useTestDeleteCompatMutation();

  async function handleRunAutoTest() {
    if (!token.trim()) {
      message.error('请先输入项目 token');
      return;
    }
    const response = await triggerRunAutoTest({
      id: colId,
      token: token.trim(),
      mode: 'json',
      projectId
    }).unwrap();
    setOpenResultText(pretty(response));
    message.success('run_auto_test 调用完成');
  }

  async function handleLoadLogList() {
    const response = await triggerLogList({
      type: 'project',
      typeid: projectId,
      page: 1,
      limit: 20
    }).unwrap();
    setLogListText(pretty(response));
  }

  async function handleListByUpdate() {
    const response = await listByUpdate({
      type: 'project',
      typeid: projectId,
      apis: [{ method: apiMethod, path: apiPath }]
    }).unwrap();
    setLogByUpdateText(pretty(response));
  }

  async function handleInterUpload() {
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
  }

  async function handleTestPost() {
    const response = await testPost({ source: 'compat-console', action: 'post' }).unwrap();
    setTestResultText(pretty(response));
  }

  async function handleTestPut() {
    const response = await testPut({ source: 'compat-console', action: 'put' }).unwrap();
    setTestResultText(pretty(response));
  }

  async function handleTestPatch() {
    const response = await testPatch({ source: 'compat-console', action: 'patch' }).unwrap();
    setTestResultText(pretty(response));
  }

  async function handleTestDelete() {
    const response = await testDelete({ source: 'compat-console', action: 'delete' }).unwrap();
    setTestResultText(pretty(response));
  }

  const testLoading =
    testPostState.isLoading ||
    testPutState.isLoading ||
    testPatchState.isLoading ||
    testDeleteState.isLoading;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Paragraph style={{ marginBottom: 8 }}>
          Compat Console：兼容接口回归验证页（`open/*`、`log/*`、`test/*`、`interface/interUpload`）。
        </Paragraph>
      </Card>

      <Card title="参数设置">
        <Row gutter={12}>
          <Col span={6}>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              value={projectId}
              onChange={value => setProjectId(Number(value || 0))}
              placeholder="Project ID"
            />
          </Col>
          <Col span={6}>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              value={colId}
              onChange={value => setColId(Number(value || 0))}
              placeholder="Col ID"
            />
          </Col>
          <Col span={12}>
            <Input
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="用于 open/run_auto_test 和 interUpload"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Open 兼容接口">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert
                showIcon
                type="info"
                message="/open/project_interface_data"
                description={openProjectDataQuery.data ? pretty(openProjectDataQuery.data) : '-'}
              />
              <Button type="primary" onClick={handleRunAutoTest} loading={runAutoTestState.isFetching}>
                调用 /open/run_auto_test (json)
              </Button>
              <Input.TextArea rows={10} readOnly value={openResultText} placeholder="run_auto_test 响应" />
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Log 兼容接口">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Button onClick={handleLoadLogList} loading={logListState.isFetching}>
                查询 /log/list
              </Button>
              <Input.TextArea rows={6} readOnly value={logListText} placeholder="log/list 响应" />

              <Row gutter={8}>
                <Col span={8}>
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
                <Col span={16}>
                  <Input value={apiPath} onChange={event => setApiPath(event.target.value)} />
                </Col>
              </Row>

              <Button onClick={handleListByUpdate} loading={logByUpdateState.isLoading}>
                查询 /log/list_by_update
              </Button>
              <Input.TextArea rows={6} readOnly value={logByUpdateText} placeholder="log/list_by_update 响应" />
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Test 兼容接口">
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
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Interface 兼容补口">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Button href="/api/interface/download_crx" target="_blank">
                下载 /interface/download_crx
              </Button>
              <Select<'normal' | 'good' | 'merge'>
                value={interUploadMode}
                onChange={setInterUploadMode}
                options={[
                  { value: 'normal', label: 'normal' },
                  { value: 'good', label: 'good' },
                  { value: 'merge', label: 'merge' }
                ]}
              />
              <Input.TextArea
                rows={8}
                value={interUploadJson}
                onChange={event => setInterUploadJson(event.target.value)}
                placeholder="interUpload 文档 JSON"
              />
              <Button onClick={handleInterUpload} loading={interUploadState.isLoading}>
                调用 /interface/interUpload
              </Button>
              <Input.TextArea rows={10} readOnly value={interUploadText} placeholder="interUpload 响应" />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
