import { useState } from 'react';
import {
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
import { getHttpMethodBadgeClassName } from '../../utils/http-method';
import { getRequestErrorMessage } from '../../utils/request-error';

const { Text } = Typography;

type CompatWorkspaceProps = {
  title?: string;
  description: string;
  requestSource: string;
};

const DEFAULT_INTER_UPLOAD_JSON =
  '{\n  "openapi": "3.0.0",\n  "info": { "title": "interUpload-demo", "version": "1.0.0" },\n  "paths": {\n    "/compat/upload-demo": {\n      "get": {\n        "summary": "demo",\n        "responses": {\n          "200": {\n            "description": "ok"\n          }\n        }\n      }\n    }\n  }\n}';

function pretty(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return String(input);
  }
}

function formatJsonInput(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (_err) {
    return null;
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
  const [interUploadJson, setInterUploadJson] = useState<string>(DEFAULT_INTER_UPLOAD_JSON);

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
  const openProjectDataText = openProjectDataQuery.data ? pretty(openProjectDataQuery.data) : '';
  const methodOptions = (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const).map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));

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

  async function copyToClipboard(text: string, label: string) {
    if (!text.trim()) {
      message.warning(`${label}为空`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  function handleFormatInterUploadJson() {
    const formatted = formatJsonInput(interUploadJson);
    if (!formatted) {
      message.error('OpenAPI JSON 不是合法格式，无法格式化');
      return;
    }
    setInterUploadJson(formatted);
    message.success('OpenAPI JSON 已格式化');
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
              className="legacy-workspace-control-top"
              min={1}
              value={projectId}
              onChange={value => setProjectId(Number(value || 0))}
            />
          </Col>
          <Col xs={24} md={6}>
            <Text>Col ID</Text>
            <InputNumber
              className="legacy-workspace-control-top"
              min={1}
              value={colId}
              onChange={value => setColId(Number(value || 0))}
            />
          </Col>
          <Col xs={24} md={12}>
            <Text>Project Token</Text>
            <Input
              className="legacy-workspace-field-top"
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
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
              <Space className="legacy-workspace-result-head" align="center">
                <Text strong>/open/project_interface_data</Text>
                <Space className="legacy-workspace-result-actions" size={8}>
                  <Button
                    size="small"
                    disabled={!openProjectDataText.trim()}
                    onClick={() => {
                      void copyToClipboard(openProjectDataText, 'project_interface_data 响应');
                    }}
                  >
                    复制响应
                  </Button>
                </Space>
              </Space>
              <Input.TextArea rows={8} readOnly value={openProjectDataText} placeholder="project_interface_data 响应" />
              <Button type="primary" onClick={handleRunAutoTest} loading={runAutoTestState.isLoading}>
                调用 /open/run_auto_test (json)
              </Button>
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!openResultText.trim()}
                  onClick={() => {
                    void copyToClipboard(openResultText, 'run_auto_test 响应');
                  }}
                >
                  复制响应
                </Button>
                <Button
                  size="small"
                  disabled={!openResultText.trim()}
                  onClick={() => setOpenResultText('')}
                >
                  清空
                </Button>
              </Space>
              <Input.TextArea rows={10} readOnly value={openResultText} placeholder="run_auto_test 响应" />
            </Space>
          </SectionCard>
        </Col>
        <Col xs={24} xl={12}>
          <SectionCard title="Log 兼容接口" className="legacy-workspace-card">
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
              <Button onClick={handleLoadLogList} loading={logListState.isFetching}>
                查询 /log/list
              </Button>
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!logListText.trim()}
                  onClick={() => {
                    void copyToClipboard(logListText, 'log/list 响应');
                  }}
                >
                  复制响应
                </Button>
                <Button size="small" disabled={!logListText.trim()} onClick={() => setLogListText('')}>
                  清空
                </Button>
              </Space>
              <Input.TextArea rows={6} readOnly value={logListText} placeholder="log/list 响应" />

              <Row gutter={8}>
                <Col xs={24} md={8}>
                  <Select<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>
                    className="legacy-workspace-control"
                    value={apiMethod}
                    onChange={setApiMethod}
                    options={methodOptions}
                  />
                </Col>
                <Col xs={24} md={16}>
                  <Input value={apiPath} onChange={event => setApiPath(event.target.value)} />
                </Col>
              </Row>

              <Button onClick={handleListByUpdate} loading={logByUpdateState.isLoading}>
                查询 /log/list_by_update
              </Button>
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!logByUpdateText.trim()}
                  onClick={() => {
                    void copyToClipboard(logByUpdateText, 'log/list_by_update 响应');
                  }}
                >
                  复制响应
                </Button>
                <Button size="small" disabled={!logByUpdateText.trim()} onClick={() => setLogByUpdateText('')}>
                  清空
                </Button>
              </Space>
              <Input.TextArea rows={6} readOnly value={logByUpdateText} placeholder="log/list_by_update 响应" />
            </Space>
          </SectionCard>
        </Col>
      </Row>

      <Row gutter={16} className="legacy-workspace-row">
        <Col xs={24} xl={12}>
          <SectionCard title="Test 兼容接口" className="legacy-workspace-card">
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
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
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!testResultText.trim()}
                  onClick={() => {
                    void copyToClipboard(testResultText, 'test/* 响应');
                  }}
                >
                  复制响应
                </Button>
                <Button size="small" disabled={!testResultText.trim()} onClick={() => setTestResultText('')}>
                  清空
                </Button>
              </Space>
              <Input.TextArea rows={10} readOnly value={testResultText} placeholder="test/* 响应" />
            </Space>
          </SectionCard>
        </Col>
        <Col xs={24} xl={12}>
          <SectionCard title="Interface 兼容补口" className="legacy-workspace-card">
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
              <Select<'normal' | 'good' | 'merge'>
                value={interUploadMode}
                onChange={setInterUploadMode}
                options={[
                  { value: 'normal', label: 'normal' },
                  { value: 'good', label: 'good' },
                  { value: 'merge', label: 'merge' }
                ]}
                className="legacy-workspace-select-compact"
              />
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button size="small" onClick={handleFormatInterUploadJson} disabled={!interUploadJson.trim()}>
                  格式化 JSON
                </Button>
                <Button size="small" onClick={() => setInterUploadJson(DEFAULT_INTER_UPLOAD_JSON)}>
                  加载示例
                </Button>
                <Button size="small" onClick={() => setInterUploadJson('')} disabled={!interUploadJson.trim()}>
                  清空
                </Button>
              </Space>
              <Input.TextArea
                rows={9}
                value={interUploadJson}
                onChange={event => setInterUploadJson(event.target.value)}
                placeholder="OpenAPI JSON"
              />
              <Button type="primary" onClick={handleInterUpload} loading={interUploadState.isLoading}>
                调用 /interface/interUpload
              </Button>
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!interUploadText.trim()}
                  onClick={() => {
                    void copyToClipboard(interUploadText, 'interUpload 响应');
                  }}
                >
                  复制响应
                </Button>
                <Button size="small" disabled={!interUploadText.trim()} onClick={() => setInterUploadText('')}>
                  清空
                </Button>
              </Space>
              <Input.TextArea rows={8} readOnly value={interUploadText} placeholder="interUpload 响应" />
            </Space>
          </SectionCard>
        </Col>
      </Row>
    </div>
  );
}
