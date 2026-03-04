import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import {
  useAddColCaseMutation,
  useAddColMutation,
  useGetColCaseEnvListQuery,
  useGetColCaseListByVarParamsQuery,
  useGetColCaseListQuery,
  useGetColListQuery,
  useLazyDelColCaseQuery,
  useLazyDelColQuery,
  useRunColCaseScriptMutation
} from '../services/yapi-api';

const { Paragraph, Text } = Typography;

function toJson(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return '{}';
  }
}

export function CaseConsolePage() {
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>('');
  const [suiteName, setSuiteName] = useState<string>('回归测试集');
  const [suiteDesc, setSuiteDesc] = useState<string>('');
  const [selectedSuiteId, setSelectedSuiteId] = useState<number>(0);
  const [interfaceId, setInterfaceId] = useState<number>(0);
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
    { col_id: selectedSuiteId, token: token || undefined },
    { skip: selectedSuiteId <= 0 }
  );
  const caseEnvQuery = useGetColCaseEnvListQuery(
    { col_id: selectedSuiteId, token: token || undefined },
    { skip: selectedSuiteId <= 0 }
  );
  const caseVarQuery = useGetColCaseListByVarParamsQuery(
    { col_id: selectedSuiteId, token: token || undefined },
    { skip: selectedSuiteId <= 0 }
  );

  const [addCol, addColState] = useAddColMutation();
  const [addCase, addCaseState] = useAddColCaseMutation();
  const [runScript, runScriptState] = useRunColCaseScriptMutation();
  const [triggerDelCol, delColState] = useLazyDelColQuery();
  const [triggerDelCase, delCaseState] = useLazyDelColCaseQuery();

  useEffect(() => {
    const rows = colListQuery.data?.data || [];
    if (rows.length === 0) {
      setSelectedSuiteId(0);
      return;
    }
    if (!selectedSuiteId || !rows.some(item => item._id === selectedSuiteId)) {
      setSelectedSuiteId(rows[0]._id);
    }
  }, [colListQuery.data, selectedSuiteId]);

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

  const suiteRows = useMemo(() => {
    const rows = colListQuery.data?.data || [];
    return rows.map(item => ({ ...item, key: item._id }));
  }, [colListQuery.data]);

  const caseRows = useMemo(() => {
    const rows = caseListQuery.data?.data || [];
    return rows.map(item => ({ ...item, key: item._id }));
  }, [caseListQuery.data]);

  async function handleCreateSuite() {
    if (!suiteName.trim()) {
      message.error('测试集名称不能为空');
      return;
    }
    const response = await addCol({
      project_id: projectId,
      token: token || undefined,
      name: suiteName.trim(),
      desc: suiteDesc.trim() || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '创建测试集失败');
      return;
    }
    message.success('测试集已创建');
    await colListQuery.refetch();
  }

  async function handleDeleteSuite(colId: number) {
    const response = await triggerDelCol({
      col_id: colId,
      token: token || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '删除测试集失败');
      return;
    }
    message.success('测试集删除成功');
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  async function handleCreateCase() {
    if (selectedSuiteId <= 0) {
      message.error('请先选择测试集');
      return;
    }
    if (interfaceId <= 0) {
      message.error('请输入 interface_id');
      return;
    }
    if (!caseName.trim()) {
      message.error('用例名称不能为空');
      return;
    }
    const response = await addCase({
      project_id: projectId,
      col_id: selectedSuiteId,
      interface_id: interfaceId,
      casename: caseName.trim(),
      token: token || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '添加用例失败');
      return;
    }
    message.success('用例已添加');
    await caseListQuery.refetch();
  }

  async function handleDeleteCase(caseId: string) {
    const response = await triggerDelCase({
      caseid: caseId,
      token: token || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '删除用例失败');
      return;
    }
    message.success('用例已删除');
    if (selectedCaseId === caseId) {
      setSelectedCaseId('');
    }
    await caseListQuery.refetch();
  }

  async function handleRunScript() {
    if (selectedSuiteId <= 0) {
      message.error('请先选择测试集');
      return;
    }
    if (interfaceId <= 0) {
      message.error('请输入 interface_id');
      return;
    }

    let body: unknown;
    try {
      body = responseBody.trim() ? JSON.parse(responseBody) : {};
    } catch (_err) {
      message.error('response.body 不是合法 JSON');
      return;
    }

    const response = await runScript({
      col_id: selectedSuiteId,
      interface_id: interfaceId,
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
      message.success('run_script 执行成功');
      return;
    }
    message.warning(response.errmsg || 'run_script 执行失败');
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Paragraph style={{ marginBottom: 8 }}>
          Case Console：测试集合与测试用例管理（`col/*`），包含脚本执行、环境视图、变量视图。
        </Paragraph>
      </Card>

      <Card title="连接参数">
        <Row gutter={12}>
          <Col span={8}>
            <Text>Project ID</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={1}
              value={projectId}
              onChange={value => setProjectId(Number(value || 0))}
            />
          </Col>
          <Col span={16}>
            <Text>Token (私有项目建议填写)</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="project token"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="测试集合">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Input value={suiteName} onChange={event => setSuiteName(event.target.value)} placeholder="测试集名称" />
              <Input value={suiteDesc} onChange={event => setSuiteDesc(event.target.value)} placeholder="测试集描述" />
              <Button type="primary" onClick={handleCreateSuite} loading={addColState.isLoading}>
                新建测试集
              </Button>
              <Table
                size="small"
                loading={colListQuery.isFetching}
                pagination={false}
                dataSource={suiteRows}
                columns={[
                  { title: 'ID', dataIndex: '_id', width: 90 },
                  { title: 'Name', dataIndex: 'name' },
                  {
                    title: '操作',
                    width: 190,
                    render: (_value, row) => (
                      <Space>
                        <Button size="small" onClick={() => setSelectedSuiteId(row._id)}>
                          选择
                        </Button>
                        <Button
                          size="small"
                          danger
                          loading={delColState.isFetching}
                          onClick={() => handleDeleteSuite(row._id)}
                        >
                          删除
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card title={`测试用例 ${selectedSuiteId > 0 ? `(col_id=${selectedSuiteId})` : ''}`}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={10}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    value={interfaceId}
                    onChange={value => setInterfaceId(Number(value || 0))}
                    placeholder="interface_id"
                  />
                </Col>
                <Col span={14}>
                  <Input value={caseName} onChange={event => setCaseName(event.target.value)} placeholder="case 名称" />
                </Col>
              </Row>

              <Button onClick={handleCreateCase} loading={addCaseState.isLoading}>
                添加用例
              </Button>

              <Table
                size="small"
                loading={caseListQuery.isFetching}
                pagination={false}
                dataSource={caseRows}
                columns={[
                  { title: 'Case ID', dataIndex: '_id', width: 180 },
                  { title: 'Name', dataIndex: 'casename' },
                  {
                    title: 'Interface',
                    width: 160,
                    render: (_value, row) => <Tag>{row.interface_id}</Tag>
                  },
                  {
                    title: '操作',
                    width: 200,
                    render: (_value, row) => (
                      <Space>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedCaseId(row._id);
                            setInterfaceId(row.interface_id);
                          }}
                        >
                          选中
                        </Button>
                        <Button size="small" danger loading={delCaseState.isFetching} onClick={() => handleDeleteCase(row._id)}>
                          删除
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="run_script 验证">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert
                showIcon
                type="info"
                message={`selected_case=${selectedCaseId || '-'} / interface_id=${interfaceId || '-'}`}
              />
              <InputNumber
                style={{ width: '100%' }}
                min={100}
                max={599}
                value={responseStatus}
                onChange={value => setResponseStatus(Number(value || 200))}
                placeholder="response.status"
              />
              <Input.TextArea
                rows={4}
                value={responseBody}
                onChange={event => setResponseBody(event.target.value)}
                placeholder='response.body (JSON), e.g. {"code":0}'
              />
              <Input.TextArea
                rows={3}
                value={scriptText}
                onChange={event => setScriptText(event.target.value)}
                placeholder="assert.equal(body.code, 0)"
              />
              <Button type="primary" onClick={handleRunScript} loading={runScriptState.isLoading}>
                执行 run_script
              </Button>
              <Input.TextArea rows={10} readOnly value={runResultText} placeholder="run_script 响应" />
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Case 变量与环境视图">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Text strong>case_env_list</Text>
              <Input.TextArea rows={7} readOnly value={envListText} placeholder="环境列表响应" />
              <Text strong>case_list_by_var_params</Text>
              <Input.TextArea rows={7} readOnly value={varCaseText} placeholder="变量参数视图响应" />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
