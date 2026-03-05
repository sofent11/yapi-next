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
  useDelColCaseMutation,
  useDelColMutation,
  useGetColCaseEnvListQuery,
  useGetColCaseListByVarParamsQuery,
  useGetColCaseListQuery,
  useGetColListQuery,
  useRunColCaseScriptMutation
} from '../../services/yapi-api';
import { getRequestErrorMessage } from '../../utils/request-error';

const { Paragraph, Text } = Typography;

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
    message.error(getRequestErrorMessage(error, fallback));
  };

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
      message.error('测试集名称不能为空');
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
        message.error(response.errmsg || '创建测试集失败');
        return;
      }
      message.success('测试集已创建');
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
        message.error(response.errmsg || '删除测试集失败');
        return;
      }
      message.success('测试集删除请求已执行');
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
        message.error(response.errmsg || '删除测试用例失败');
        return;
      }
      message.success('测试用例删除请求已执行');
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
      message.error('请先选择测试集');
      return;
    }
    if (caseInterfaceId <= 0) {
      message.error('请输入 interface_id');
      return;
    }
    if (!caseName.trim()) {
      message.error('用例名称不能为空');
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
        message.error(response.errmsg || '添加用例失败');
        return;
      }
      message.success('用例已添加');
      await caseListQuery.refetch();
    } catch (error) {
      notifyRequestError(error, '添加用例失败');
    }
  }

  async function handleRunScript() {
    if (selectedColId <= 0) {
      message.error('请先选择测试集');
      return;
    }
    if (caseInterfaceId <= 0) {
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
        message.success('run_script 执行成功');
        return;
      }
      message.warning(response.errmsg || 'run_script 执行失败');
    } catch (error) {
      notifyRequestError(error, 'run_script 执行失败');
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={props.title}>
        <Paragraph type={props.descriptionType} style={{ marginBottom: props.descriptionType ? 0 : 8 }}>
          {props.description}
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
              <Input value={colName} onChange={event => setColName(event.target.value)} placeholder="测试集名称" />
              <Input value={colDesc} onChange={event => setColDesc(event.target.value)} placeholder="测试集描述" />
              <Button type="primary" onClick={handleAddCol} loading={addColState.isLoading}>
                新建测试集
              </Button>
              <Table
                size="small"
                loading={colListQuery.isFetching}
                pagination={false}
                dataSource={colRows}
                columns={[
                  { title: 'ID', dataIndex: '_id', width: 90 },
                  { title: 'Name', dataIndex: 'name' },
                  {
                    title: '操作',
                    width: 170,
                    render: (_value, row) => (
                      <Space>
                        <Button size="small" onClick={() => setSelectedColId(row._id)}>
                          选择
                        </Button>
                        <Button
                          size="small"
                          danger
                          loading={delColState.isLoading}
                          onClick={() => handleDeleteCol(row._id)}
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
          <Card title={`测试用例 ${selectedColId > 0 ? `(col_id=${selectedColId})` : ''}`}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={10}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    value={caseInterfaceId}
                    onChange={value => setCaseInterfaceId(Number(value || 0))}
                    placeholder="interface_id"
                  />
                </Col>
                <Col span={14}>
                  <Input value={caseName} onChange={event => setCaseName(event.target.value)} placeholder="case 名称" />
                </Col>
              </Row>
              <Button onClick={handleAddCase} loading={addCaseState.isLoading}>
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
                            setCaseInterfaceId(row.interface_id);
                          }}
                        >
                          选中
                        </Button>
                        <Button
                          size="small"
                          danger
                          loading={delCaseState.isLoading}
                          onClick={() => handleDeleteCase(row._id)}
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
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="run_script 验证">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Alert
                showIcon
                type="info"
                message={`selected_case=${selectedCaseId || '-'} / interface_id=${caseInterfaceId || '-'}`}
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
