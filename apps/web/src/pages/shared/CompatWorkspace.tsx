import { useState } from 'react';
import {
  Button,
  NumberInput,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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

type CompatWorkspaceProps = {
  title?: string;
  description: string;
  requestSource: string;
};

const DEFAULT_INTER_UPLOAD_JSON =
  '{\n  "openapi": "3.0.0",\n  "info": { "title": "interUpload-demo", "version": "1.0.0" },\n  "paths": {\n    "/compat/upload-demo": {\n      "get": {\n        "summary": "demo",\n        "responses": {\n          "200": {\n            "description": "ok"\n          }\n        }\n      }\n    }\n  }\n}';

const methodValues = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
const mergeOptions = ['normal', 'good', 'merge'] as const;

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

function showNotification(color: 'teal' | 'red' | 'yellow', message: string) {
  notifications.show({ color, message });
}

function ResultActions(props: {
  text: string;
  copyLabel: string;
  onClear?: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="default" size="compact-sm" disabled={!props.text.trim()} onClick={props.onCopy}>
        复制响应
      </Button>
      {props.onClear ? (
        <Button variant="default" size="compact-sm" disabled={!props.text.trim()} onClick={props.onClear}>
          清空
        </Button>
      ) : null}
    </div>
  );
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

  const openProjectDataText = openProjectDataQuery.data ? pretty(openProjectDataQuery.data) : '';
  const methodOptions = methodValues.map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));

  const notifyRequestError = (error: unknown, fallback: string) => {
    showNotification('red', getRequestErrorMessage(error, fallback));
  };

  async function handleRunAutoTest() {
    if (!token.trim()) {
      showNotification('red', '请先输入项目 token');
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
      showNotification('teal', 'run_auto_test 调用完成');
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
        showNotification('teal', 'interUpload 导入完成');
        return;
      }
      showNotification('yellow', response.errmsg || 'interUpload 执行失败');
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
      showNotification('yellow', `${label}为空`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showNotification('teal', `${label}已复制`);
    } catch (_err) {
      showNotification('red', '复制失败，请手动复制');
    }
  }

  function handleFormatInterUploadJson() {
    const formatted = formatJsonInput(interUploadJson);
    if (!formatted) {
      showNotification('red', 'OpenAPI JSON 不是合法格式，无法格式化');
      return;
    }
    setInterUploadJson(formatted);
    showNotification('teal', 'OpenAPI JSON 已格式化');
  }

  const testLoading =
    testPostState.isLoading ||
    testPutState.isLoading ||
    testPatchState.isLoading ||
    testDeleteState.isLoading;

  return (
    <div className="workspace-page compat-workspace">
      <PageHeader title={props.title || 'Compat Console'} subtitle={props.description} />

      <SectionCard title="参数设置" className="workspace-card">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <div>
            <Text mb={6}>Project ID</Text>
            <NumberInput min={1} value={projectId} onChange={value => setProjectId(Number(value || 0))} />
          </div>
          <div>
            <Text mb={6}>Col ID</Text>
            <NumberInput min={1} value={colId} onChange={value => setColId(Number(value || 0))} />
          </div>
          <div>
            <Text mb={6}>Project Token</Text>
            <TextInput
              value={token}
              onChange={event => setToken(event.currentTarget.value)}
              placeholder="用于 open/run_auto_test 和 interUpload"
            />
          </div>
        </SimpleGrid>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Open 兼容接口" className="workspace-card">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Text fw={700}>/open/project_interface_data</Text>
              <Button
                variant="default"
                size="compact-sm"
                disabled={!openProjectDataText.trim()}
                onClick={() => {
                  void copyToClipboard(openProjectDataText, 'project_interface_data 响应');
                }}
              >
                复制响应
              </Button>
            </div>
            <Textarea minRows={8} autosize readOnly value={openProjectDataText} placeholder="project_interface_data 响应" />
            <Button onClick={handleRunAutoTest} loading={runAutoTestState.isLoading}>
              调用 /open/run_auto_test (json)
            </Button>
            <ResultActions
              text={openResultText}
              copyLabel="run_auto_test 响应"
              onCopy={() => {
                void copyToClipboard(openResultText, 'run_auto_test 响应');
              }}
              onClear={() => setOpenResultText('')}
            />
            <Textarea minRows={10} autosize readOnly value={openResultText} placeholder="run_auto_test 响应" />
          </div>
        </SectionCard>

        <SectionCard title="Log 兼容接口" className="workspace-card">
          <div className="space-y-3">
            <Button variant="default" onClick={handleLoadLogList} loading={logListState.isFetching}>
              查询 /log/list
            </Button>
            <ResultActions
              text={logListText}
              copyLabel="log/list 响应"
              onCopy={() => {
                void copyToClipboard(logListText, 'log/list 响应');
              }}
              onClear={() => setLogListText('')}
            />
            <Textarea minRows={6} autosize readOnly value={logListText} placeholder="log/list 响应" />

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              <Select
                value={apiMethod}
                onChange={value => setApiMethod((value as typeof apiMethod) || 'GET')}
                data={methodOptions}
              />
              <TextInput value={apiPath} onChange={event => setApiPath(event.currentTarget.value)} />
            </SimpleGrid>

            <Button variant="default" onClick={handleListByUpdate} loading={logByUpdateState.isLoading}>
              查询 /log/list_by_update
            </Button>
            <ResultActions
              text={logByUpdateText}
              copyLabel="log/list_by_update 响应"
              onCopy={() => {
                void copyToClipboard(logByUpdateText, 'log/list_by_update 响应');
              }}
              onClear={() => setLogByUpdateText('')}
            />
            <Textarea minRows={6} autosize readOnly value={logByUpdateText} placeholder="log/list_by_update 响应" />
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard title="Test 兼容接口" className="workspace-card">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="default" onClick={handleTestPost} loading={testLoading}>POST</Button>
              <Button variant="default" onClick={handleTestPut} loading={testLoading}>PUT</Button>
              <Button variant="default" onClick={handleTestPatch} loading={testLoading}>PATCH</Button>
              <Button variant="default" onClick={handleTestDelete} loading={testLoading}>DELETE</Button>
            </div>
            <ResultActions
              text={testResultText}
              copyLabel="test/* 响应"
              onCopy={() => {
                void copyToClipboard(testResultText, 'test/* 响应');
              }}
              onClear={() => setTestResultText('')}
            />
            <Textarea minRows={10} autosize readOnly value={testResultText} placeholder="test/* 响应" />
          </div>
        </SectionCard>

        <SectionCard title="Interface 兼容补口" className="workspace-card">
          <div className="space-y-3">
            <Select
              value={interUploadMode}
              onChange={value => setInterUploadMode((value as typeof interUploadMode) || 'normal')}
              data={mergeOptions.map(item => ({ value: item, label: item }))}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="compact-sm" onClick={handleFormatInterUploadJson} disabled={!interUploadJson.trim()}>
                格式化 JSON
              </Button>
              <Button variant="default" size="compact-sm" onClick={() => setInterUploadJson(DEFAULT_INTER_UPLOAD_JSON)}>
                加载示例
              </Button>
              <Button variant="default" size="compact-sm" onClick={() => setInterUploadJson('')} disabled={!interUploadJson.trim()}>
                清空
              </Button>
            </div>
            <Textarea
              minRows={9}
              autosize
              value={interUploadJson}
              onChange={event => setInterUploadJson(event.currentTarget.value)}
              placeholder="OpenAPI JSON"
            />
            <Button onClick={handleInterUpload} loading={interUploadState.isLoading}>
              调用 /interface/interUpload
            </Button>
            <ResultActions
              text={interUploadText}
              copyLabel="interUpload 响应"
              onCopy={() => {
                void copyToClipboard(interUploadText, 'interUpload 响应');
              }}
              onClear={() => setInterUploadText('')}
            />
            <Textarea minRows={8} autosize readOnly value={interUploadText} placeholder="interUpload 响应" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
