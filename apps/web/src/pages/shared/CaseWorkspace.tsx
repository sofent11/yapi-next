import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  NumberInput,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  useAddColCaseMutation,
  useAddColMutation,
  useDelColCaseMutation,
  useDelColMutation,
  useGetColCaseEnvListQuery,
  useGetColCaseListByVarParamsQuery,
  useGetColCaseListQuery,
  useGetColListQuery,
  useRunColCaseScriptMutation
} from '../../services/yapi-api';
import { PageHeader, SectionCard } from '../../components/layout';
import { getRequestErrorMessage } from '../../utils/request-error';

type CaseWorkspaceProps = {
  title?: string;
  description: string;
  descriptionType?: 'secondary';
};

function toJson(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return '{}';
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
  onCopy: () => void;
  onClear?: () => void;
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

export function CaseWorkspace(props: CaseWorkspaceProps) {
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>('');
  const [colName, setColName] = useState<string>('回归测试集');
  const [colDesc, setColDesc] = useState<string>('');
  const [selectedColId, setSelectedColId] = useState<number>(0);
  const [caseInterfaceId, setCaseInterfaceId] = useState<number>(0);
  const [caseName, setCaseName] = useState<string>('case-demo');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [responseStatus, setResponseStatus] = useState<number>(200);
  const [responseBody, setResponseBody] = useState<string>('{"code":0}');
  const [scriptText, setScriptText] = useState<string>("assert.equal(body.code, 0); log('case-script-ok')");
  const [runResultText, setRunResultText] = useState<string>('');
  const [varCaseText, setVarCaseText] = useState<string>('');
  const [envListText, setEnvListText] = useState<string>('');

  const colListQuery = useGetColListQuery({
    project_id: projectId,
    token: token || undefined
  });
  const caseListQuery = useGetColCaseListQuery(
    { col_id: selectedColId, token: token || undefined },
    { skip: selectedColId <= 0 }
  );
  const caseEnvQuery = useGetColCaseEnvListQuery(
    { col_id: selectedColId, token: token || undefined },
    { skip: selectedColId <= 0 }
  );
  const caseVarQuery = useGetColCaseListByVarParamsQuery(
    { col_id: selectedColId, token: token || undefined },
    { skip: selectedColId <= 0 }
  );
  const [addCol, addColState] = useAddColMutation();
  const [addCase, addCaseState] = useAddColCaseMutation();
  const [runScript, runScriptState] = useRunColCaseScriptMutation();
  const [triggerDelCol, delColState] = useDelColMutation();
  const [triggerDelCase, delCaseState] = useDelColCaseMutation();

  const notifyRequestError = (error: unknown, fallback: string) => {
    showNotification('red', getRequestErrorMessage(error, fallback));
  };

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

  useEffect(() => {
    const rows = colListQuery.data?.data || [];
    if (rows.length === 0) {
      setSelectedColId(0);
      return;
    }
    if (!selectedColId || !rows.some(item => item._id === selectedColId)) {
      setSelectedColId(rows[0]._id);
    }
  }, [colListQuery.data, selectedColId]);

  useEffect(() => {
    if (caseVarQuery.data?.errcode === 0) {
      setVarCaseText(toJson(caseVarQuery.data.data));
    }
  }, [caseVarQuery.data]);

  useEffect(() => {
    if (caseEnvQuery.data?.errcode === 0) {
      setEnvListText(toJson(caseEnvQuery.data.data));
    }
  }, [caseEnvQuery.data]);

  const colRows = useMemo(() => {
    const rows = colListQuery.data?.data || [];
    return rows.map(item => ({ ...item, key: item._id }));
  }, [colListQuery.data]);

  const caseRows = useMemo(() => {
    const rows = caseListQuery.data?.data || [];
    return rows.map(item => ({ ...item, key: item._id }));
  }, [caseListQuery.data]);

  async function handleAddCol() {
    if (!colName.trim()) {
      showNotification('red', '测试集名称不能为空');
      return;
    }
    try {
      const response = await addCol({
        project_id: projectId,
        token: token || undefined,
        name: colName.trim(),
        desc: colDesc.trim() || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        showNotification('red', response.errmsg || '创建测试集失败');
        return;
      }
      showNotification('teal', '测试集已创建');
      await colListQuery.refetch();
    } catch (error) {
      notifyRequestError(error, '创建测试集失败');
    }
  }

  async function handleDeleteCol(colId: number) {
    try {
      const response = await triggerDelCol({
        col_id: colId,
        project_id: projectId,
        token: token || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        showNotification('red', response.errmsg || '删除测试集失败');
        return;
      }
      showNotification('teal', '测试集删除请求已执行');
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    } catch (error) {
      notifyRequestError(error, '删除测试集失败');
    }
  }

  async function handleDeleteCase(caseId: string) {
    try {
      const response = await triggerDelCase({
        caseid: caseId,
        col_id: selectedColId > 0 ? selectedColId : undefined,
        token: token || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        showNotification('red', response.errmsg || '删除测试用例失败');
        return;
      }
      showNotification('teal', '测试用例删除请求已执行');
      if (selectedCaseId === caseId) {
        setSelectedCaseId('');
      }
      await caseListQuery.refetch();
    } catch (error) {
      notifyRequestError(error, '删除测试用例失败');
    }
  }

  async function handleAddCase() {
    if (selectedColId <= 0) {
      showNotification('red', '请先选择测试集');
      return;
    }
    if (caseInterfaceId <= 0) {
      showNotification('red', '请输入 interface_id');
      return;
    }
    if (!caseName.trim()) {
      showNotification('red', '用例名称不能为空');
      return;
    }
    try {
      const response = await addCase({
        project_id: projectId,
        col_id: selectedColId,
        interface_id: caseInterfaceId,
        casename: caseName.trim(),
        token: token || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        showNotification('red', response.errmsg || '添加用例失败');
        return;
      }
      showNotification('teal', '用例已添加');
      await caseListQuery.refetch();
    } catch (error) {
      notifyRequestError(error, '添加用例失败');
    }
  }

  async function handleRunScript() {
    if (selectedColId <= 0) {
      showNotification('red', '请先选择测试集');
      return;
    }
    if (caseInterfaceId <= 0) {
      showNotification('red', '请输入 interface_id');
      return;
    }
    let body: unknown;
    try {
      body = responseBody.trim() ? JSON.parse(responseBody) : {};
    } catch (_err) {
      showNotification('red', 'response.body 不是合法 JSON');
      return;
    }
    try {
      const response = await runScript({
        col_id: selectedColId,
        interface_id: caseInterfaceId,
        token: token || undefined,
        response: {
          status: responseStatus,
          body,
          header: {}
        },
        records: {},
        params: {},
        script: scriptText
      }).unwrap();
      setRunResultText(toJson(response));
      if (response.errcode === 0) {
        showNotification('teal', 'run_script 执行成功');
        return;
      }
      showNotification('yellow', response.errmsg || 'run_script 执行失败');
    } catch (error) {
      notifyRequestError(error, 'run_script 执行失败');
    }
  }

  function handleFormatResponseBody() {
    const formatted = formatJsonInput(responseBody);
    if (!formatted) {
      showNotification('red', 'response.body 不是合法 JSON，无法格式化');
      return;
    }
    setResponseBody(formatted);
    showNotification('teal', 'response.body 已格式化');
  }

  return (
    <div className="legacy-workspace-page legacy-case-workspace">
      <PageHeader title={props.title || 'Case Console'} subtitle={props.description} />

      <SectionCard title="连接参数" className="legacy-workspace-card">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <div>
            <Text mb={6}>Project ID</Text>
            <NumberInput min={1} value={projectId} onChange={value => setProjectId(Number(value || 0))} />
          </div>
          <div>
            <Text mb={6}>Token (私有项目建议填写)</Text>
            <TextInput
              value={token}
              onChange={event => setToken(event.currentTarget.value)}
              placeholder="project token"
            />
          </div>
        </SimpleGrid>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="测试集合" className="legacy-workspace-card">
          <div className="space-y-3">
            <TextInput value={colName} onChange={event => setColName(event.currentTarget.value)} placeholder="测试集名称" />
            <TextInput value={colDesc} onChange={event => setColDesc(event.currentTarget.value)} placeholder="测试集描述" />
            <Button onClick={handleAddCol} loading={addColState.isLoading}>
              新建测试集
            </Button>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>操作</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {colRows.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <div className="py-8 text-center text-sm text-slate-500">
                          {colListQuery.isFetching ? '加载中...' : '暂无测试集合'}
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    colRows.map(row => (
                      <Table.Tr key={row.key}>
                        <Table.Td>{row._id}</Table.Td>
                        <Table.Td>{row.name}</Table.Td>
                        <Table.Td>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="default" size="compact-sm" onClick={() => setSelectedColId(row._id)}>
                              选择
                            </Button>
                            <Button
                              color="red"
                              variant="light"
                              size="compact-sm"
                              loading={delColState.isLoading}
                              onClick={() => handleDeleteCol(row._id)}
                            >
                              删除
                            </Button>
                          </div>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={`测试用例 ${selectedColId > 0 ? `(col_id=${selectedColId})` : ''}`} className="legacy-workspace-card">
          <div className="space-y-3">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              <NumberInput
                min={1}
                value={caseInterfaceId}
                onChange={value => setCaseInterfaceId(Number(value || 0))}
                placeholder="interface_id"
              />
              <TextInput value={caseName} onChange={event => setCaseName(event.currentTarget.value)} placeholder="case 名称" />
            </SimpleGrid>
            <Button variant="default" onClick={handleAddCase} loading={addCaseState.isLoading}>
              添加用例
            </Button>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Case ID</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Interface</Table.Th>
                    <Table.Th>操作</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {caseRows.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <div className="py-8 text-center text-sm text-slate-500">
                          {selectedColId > 0 ? '该测试集暂无用例' : '请先选择测试集'}
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    caseRows.map(row => (
                      <Table.Tr
                        key={row.key}
                        className={selectedCaseId && row._id === selectedCaseId ? 'legacy-workspace-active-row' : undefined}
                      >
                        <Table.Td>{row._id}</Table.Td>
                        <Table.Td>{row.casename}</Table.Td>
                        <Table.Td><Badge variant="light">{String(row.interface_id)}</Badge></Table.Td>
                        <Table.Td>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="default"
                              size="compact-sm"
                              onClick={() => {
                                setSelectedCaseId(row._id);
                                setCaseInterfaceId(row.interface_id);
                              }}
                            >
                              选中
                            </Button>
                            <Button
                              color="red"
                              variant="light"
                              size="compact-sm"
                              loading={delCaseState.isLoading}
                              onClick={() => handleDeleteCase(row._id)}
                            >
                              删除
                            </Button>
                          </div>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard title="run_script 验证" className="legacy-workspace-card">
          <div className="space-y-3">
            <Alert color="blue" title={`selected_case=${selectedCaseId || '-'} / interface_id=${caseInterfaceId || '-'}`} />
            <NumberInput
              min={100}
              max={599}
              value={responseStatus}
              onChange={value => setResponseStatus(Number(value || 200))}
              placeholder="response.status"
            />
            <Textarea
              minRows={4}
              autosize
              value={responseBody}
              onChange={event => setResponseBody(event.currentTarget.value)}
              placeholder='response.body (JSON), e.g. {"code":0}'
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="compact-sm" onClick={handleFormatResponseBody} disabled={!responseBody.trim()}>
                格式化 Body JSON
              </Button>
            </div>
            <Textarea
              minRows={3}
              autosize
              value={scriptText}
              onChange={event => setScriptText(event.currentTarget.value)}
              placeholder="assert.equal(body.code, 0)"
            />
            <Button onClick={handleRunScript} loading={runScriptState.isLoading}>
              执行 run_script
            </Button>
            <ResultActions
              text={runResultText}
              copyLabel="run_script 响应"
              onCopy={() => {
                void copyToClipboard(runResultText, 'run_script 响应');
              }}
              onClear={() => setRunResultText('')}
            />
            <Textarea minRows={10} autosize readOnly value={runResultText} placeholder="run_script 响应" />
          </div>
        </SectionCard>

        <SectionCard title="Case 变量与环境视图" className="legacy-workspace-card">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text fw={700}>case_env_list</Text>
                <Button
                  variant="default"
                  size="compact-sm"
                  disabled={!envListText.trim()}
                  onClick={() => {
                    void copyToClipboard(envListText, 'case_env_list 响应');
                  }}
                >
                  复制响应
                </Button>
              </div>
              <Textarea minRows={7} autosize readOnly value={envListText} placeholder="环境列表响应" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text fw={700}>case_list_by_var_params</Text>
                <Button
                  variant="default"
                  size="compact-sm"
                  disabled={!varCaseText.trim()}
                  onClick={() => {
                    void copyToClipboard(varCaseText, 'case_list_by_var_params 响应');
                  }}
                >
                  复制响应
                </Button>
              </div>
              <Textarea minRows={7} autosize readOnly value={varCaseText} placeholder="变量参数视图响应" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
