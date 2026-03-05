import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popover,
  Radio,
  Select,
  Space,
  Switch,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { LockOutlined, QuestionCircleOutlined, UnlockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  useDelProjectMutation,
  useGetGroupListQuery,
  useGetProjectEnvQuery,
  useGetProjectQuery,
  useGetProjectTokenQuery,
  useUpdateProjectEnvMutation,
  useUpdateProjectMutation,
  useUpdateProjectTokenMutation,
  useUpsetProjectMutation
} from '../../services/yapi-api';
import { webPlugins, type SubSettingNavItem } from '../../plugins';
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  renderProjectIcon,
  resolveProjectColor,
  resolveProjectColorKey
} from '../../utils/project-visual';
import { legacyNameValidator } from '../../utils/legacy-validation';
import { PageHeader, SectionCard } from '../../components/layout';

import './ProjectSetting.scss';

type ProjectSettingPageProps = {
  projectId: number;
};

type ProjectForm = {
  name: string;
  group_id?: number;
  basepath?: string;
  desc?: string;
  switch_notice?: boolean;
  strice?: boolean;
  is_json5?: boolean;
  project_type?: 'public' | 'private';
};

type RequestForm = {
  pre_script?: string;
  after_script?: string;
};

type MockForm = {
  is_mock_open?: boolean;
  project_mock_script?: string;
};

type EnvEditorItem = {
  key: string;
  name: string;
  domain: string;
  headerText: string;
  globalText: string;
};

const { Text } = Typography;

export function ProjectSettingPage(props: ProjectSettingPageProps) {
  const navigate = useNavigate();
  const [projectForm] = Form.useForm<ProjectForm>();
  const [requestForm] = Form.useForm<RequestForm>();
  const [mockForm] = Form.useForm<MockForm>();
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const groupListQuery = useGetGroupListQuery();
  const envQuery = useGetProjectEnvQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const tokenQuery = useGetProjectTokenQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const [updateProject, updateState] = useUpdateProjectMutation();
  const [upsetProject, upsetState] = useUpsetProjectMutation();
  const [updateProjectEnv, updateEnvState] = useUpdateProjectEnvMutation();
  const [updateProjectToken, updateTokenState] = useUpdateProjectTokenMutation();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [projectType, setProjectType] = useState<'public' | 'private'>('private');
  const [activeTab, setActiveTab] = useState('message');
  const [envEditors, setEnvEditors] = useState<EnvEditorItem[]>([]);
  const [delProject, delState] = useDelProjectMutation();

  const project = detailQuery.data?.data;
  const canDeleteProject = project?.role === 'owner' || project?.role === 'admin';
  const canPublicProject = project?.role === 'admin';
  const canChangeProjectGroup = project?.role === 'owner' || project?.role === 'admin';
  const projectName = String(project?.name || '');
  const groupOptions = useMemo(
    () =>
      (groupListQuery.data?.data || []).map(item => ({
        value: Number(item._id || 0),
        label: item.group_name
      })),
    [groupListQuery.data]
  );
  const currentGroupName = useMemo(() => {
    const gid = Number(project?.group_id || 0);
    return groupOptions.find(item => Number(item.value) === gid)?.label || '';
  }, [groupOptions, project?.group_id]);
  const projectVisual = (project || {}) as unknown as Record<string, unknown>;
  const projectColorKey = String(projectVisual.color || 'blue');
  const projectIconKey = String(projectVisual.icon || 'code-o');
  const projectVisualColor = resolveProjectColor(projectColorKey, String(project?.name || props.projectId));
  const projectVisualColorKey = resolveProjectColorKey(projectColorKey);
  const projectVisualColorClass = projectVisualColorKey ? `legacy-project-color-${projectVisualColorKey}` : '';

  const mockUrl = useMemo(() => {
    if (!project?._id) return '-';
    const origin = window.location.origin;
    const basepath = project.basepath || '';
    return `${origin}/mock/${project._id}${basepath}+接口请求路径`;
  }, [project?._id, project?.basepath]);
  const pluginSettingTabs = useMemo<Record<string, SubSettingNavItem>>(() => {
    const tabs: Record<string, SubSettingNavItem> = {};
    webPlugins.applySubSettingNav(tabs, { projectId: props.projectId });
    return tabs;
  }, [props.projectId]);

  function toJsonText(value: unknown): string {
    if (!value) return '[]';
    try {
      return JSON.stringify(value, null, 2);
    } catch (_err) {
      return '[]';
    }
  }

  useEffect(() => {
    const data = detailQuery.data?.data;
    if (!data) return;
    const meta = data as unknown as Record<string, unknown>;
    setProjectType((data.project_type || 'private') as 'public' | 'private');
    projectForm.setFieldsValue({
      name: data.name || '',
      group_id: Number(data.group_id || 0) || undefined,
      basepath: data.basepath || '',
      desc: data.desc || '',
      switch_notice: Boolean(meta.switch_notice),
      strice: Boolean(meta.strice),
      is_json5: Boolean(meta.is_json5),
      project_type: (data.project_type || 'private') as 'public' | 'private'
    });
    requestForm.setFieldsValue({
      pre_script: String(meta.pre_script || ''),
      after_script: String(meta.after_script || '')
    });
    mockForm.setFieldsValue({
      is_mock_open: Boolean(meta.is_mock_open),
      project_mock_script: String(meta.project_mock_script || '')
    });
  }, [detailQuery.data, mockForm, projectForm, requestForm]);

  useEffect(() => {
    const envList = envQuery.data?.data?.env || [];
    const mapped = envList.map((item, index) => ({
      key: `${index}-${Date.now()}`,
      name: String(item.name || ''),
      domain: String(item.domain || ''),
      headerText: toJsonText(item.header || []),
      globalText: toJsonText(item.global || [])
    }));
    setEnvEditors(mapped);
  }, [envQuery.data]);

  async function handleSubmit(values: ProjectForm) {
    const response = await updateProject({
      id: props.projectId,
      name: values.name?.trim(),
      group_id: Number(values.group_id || 0) || undefined,
      basepath: values.basepath?.trim(),
      desc: values.desc?.trim(),
      switch_notice: Boolean(values.switch_notice),
      strice: Boolean(values.strice),
      is_json5: Boolean(values.is_json5),
      project_type: values.project_type || projectType
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '更新项目失败');
      return;
    }
    message.success('项目设置已更新');
    await detailQuery.refetch();
  }

  async function handleSaveRequest() {
    const values = await requestForm.validateFields();
    const response = await updateProject({
      id: props.projectId,
      pre_script: values.pre_script || '',
      after_script: values.after_script || ''
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存请求配置失败');
      return;
    }
    message.success('请求配置已更新');
    await detailQuery.refetch();
  }

  async function handleSaveMock() {
    const values = await mockForm.validateFields();
    const response = await updateProject({
      id: props.projectId,
      is_mock_open: Boolean(values.is_mock_open),
      project_mock_script: values.project_mock_script || ''
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存 mock 脚本失败');
      return;
    }
    message.success('全局 mock 配置已更新');
    await detailQuery.refetch();
  }

  async function handleChangeProjectColor(nextColor: string) {
    if (!project?._id || !nextColor) return;
    const response = await upsetProject({
      id: props.projectId,
      color: nextColor,
      icon: projectIconKey
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改项目样式失败');
      return;
    }
    await detailQuery.refetch();
  }

  async function handleChangeProjectIcon(nextIcon: string) {
    if (!project?._id || !nextIcon) return;
    const response = await upsetProject({
      id: props.projectId,
      color: projectColorKey || 'blue',
      icon: nextIcon
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改项目样式失败');
      return;
    }
    await detailQuery.refetch();
  }

  function parseJsonArray(value: string, label: string): Array<Record<string, unknown>> {
    if (!value.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (_err) {
      throw new Error(`${label} 不是合法 JSON`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} 必须是数组 JSON`);
    }
    return parsed as Array<Record<string, unknown>>;
  }

  async function handleSaveEnv() {
    if (envEditors.some(item => !item.name.trim())) {
      message.error('环境名称不能为空');
      return;
    }
    let env: Array<{ name: string; domain: string; header: Array<Record<string, unknown>>; global: Array<Record<string, unknown>> }>;
    try {
      env = envEditors.map(item => ({
        name: item.name.trim(),
        domain: item.domain.trim(),
        header: parseJsonArray(item.headerText, `环境 ${item.name || '-'} 的 header`),
        global: parseJsonArray(item.globalText, `环境 ${item.name || '-'} 的 global`)
      }));
    } catch (err) {
      message.error((err as Error).message || '环境配置 JSON 格式错误');
      return;
    }
    const response = await updateProjectEnv({
      id: props.projectId,
      env
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存环境配置失败');
      return;
    }
    message.success('环境配置已更新');
    await Promise.all([envQuery.refetch(), detailQuery.refetch()]);
  }

  function handleCopyToken() {
    const token = String(tokenQuery.data?.data || '');
    if (!token) {
      message.warning('token 为空');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(token);
      message.success('已经成功复制到剪切板');
      return;
    }
    const input = document.createElement('input');
    input.value = token;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    message.success('已经成功复制到剪切板');
  }

  function handleRegenerateToken() {
    Modal.confirm({
      title: '重新生成key',
      content: '重新生成之后，之前的key将无法使用，确认重新生成吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const response = await updateProjectToken({ projectId: props.projectId }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '更新 token 失败');
          return;
        }
        message.success('更新成功');
        await tokenQuery.refetch();
      }
    });
  }

  async function handleDeleteProject() {
    if (!canDeleteProject) {
      message.error('没有权限删除项目');
      return;
    }
    if (deleteConfirmText.trim() !== projectName) {
      message.error('项目名称有误');
      return;
    }
    const response = await delProject({ id: props.projectId }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '删除项目失败');
      return;
    }
    message.success('删除成功');
    setDeleteModalOpen(false);
    navigate(`/group/${project?.group_id || ''}`);
  }

  return (
    <div className="legacy-page-shell legacy-project-setting-page">
      <PageHeader
        title="项目设置"
        subtitle={`管理项目基础信息、环境变量、请求脚本、Token 与全局 Mock 配置。`}
      />
      <Tabs
        type="card"
        className="has-affix-footer tabs-large legacy-setting-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'message',
            label: '项目配置',
            children: (
              <SectionCard className="m-panel legacy-project-setting-card">
                <div className="legacy-project-setting-head legacy-project-setting-head-card">
                  <Popover
                    trigger="click"
                    placement="bottom"
                    overlayClassName="legacy-project-visual-popover"
                    title={
                      <Radio.Group
                        className="legacy-project-color-group"
                        value={projectColorKey}
                        onChange={event => void handleChangeProjectColor(String(event.target.value || ''))}
                        disabled={upsetState.isLoading}
                      >
                        {PROJECT_COLOR_OPTIONS.map(item => (
                          <Radio.Button
                            key={item}
                            value={item}
                            className={`legacy-project-color-option legacy-project-color-${item}`}
                          >
                            {projectColorKey === item ? '✓' : null}
                          </Radio.Button>
                        ))}
                      </Radio.Group>
                    }
                    content={
                      <Radio.Group
                        className="legacy-project-icon-group"
                        value={projectIconKey}
                        onChange={event => void handleChangeProjectIcon(String(event.target.value || ''))}
                        disabled={upsetState.isLoading}
                      >
                        {PROJECT_ICON_OPTIONS.map(item => (
                          <Radio.Button key={item} value={item} className="legacy-project-icon-option">
                            {renderProjectIcon(item)}
                          </Radio.Button>
                        ))}
                      </Radio.Group>
                    }
                  >
                    <button type="button" className="legacy-project-setting-logo-btn">
                      <span
                        className={`legacy-project-setting-logo ${projectVisualColorClass}`.trim()}
                        title="点击修改项目图标和颜色"
                        style={projectVisualColorClass ? undefined : { backgroundColor: projectVisualColor }}
                      >
                        {renderProjectIcon(projectIconKey)}
                      </span>
                      <span className="legacy-project-setting-logo-mask">点击修改</span>
                    </button>
                  </Popover>

                  <div className="legacy-project-setting-head-info">
                    <h2 className="legacy-project-setting-head-title">
                      {(currentGroupName ? `${currentGroupName} / ` : '') + (project?.name || '')}
                    </h2>
                  </div>
                </div>
                <hr className="legacy-breakline" />

                <Form<ProjectForm> form={projectForm} onFinish={handleSubmit} labelCol={{ lg: { offset: 1, span: 3 }, xs: { span: 24 }, sm: { span: 6 } }} wrapperCol={{ lg: { span: 19 }, xs: { span: 24 }, sm: { span: 14 } }}>
                  <Form.Item label="项目ID" className="form-item">
                    <span>{project?._id || '-'}</span>
                  </Form.Item>
                  <Form.Item
                    label="项目名称"
                    name="name"
                    rules={[{ required: true, validator: legacyNameValidator('项目') }]}
                    className="form-item"
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="所属分组"
                    name="group_id"
                    rules={[{ required: true, message: '请选择所属分组' }]}
                    className="form-item"
                  >
                    <Select
                      options={groupOptions}
                      loading={groupListQuery.isLoading}
                      disabled={!canChangeProjectGroup}
                      placeholder="请选择所属分组"
                    />
                  </Form.Item>
                  <Form.Item
                    label={
                      <span>
                        接口基本路径&nbsp;
                        <Tooltip title="基本路径为空表示根路径">
                          <QuestionCircleOutlined />
                        </Tooltip>
                      </span>
                    }
                    name="basepath"
                    className="form-item"
                  >
                    <Input placeholder="/api/v1" />
                  </Form.Item>
                  <Form.Item
                    label={
                      <span>
                        MOCK地址&nbsp;
                        <Tooltip title="具体使用方法请查看文档">
                          <QuestionCircleOutlined />
                        </Tooltip>
                      </span>
                    }
                    className="form-item"
                  >
                    <Input value={mockUrl} disabled />
                  </Form.Item>
                  <Form.Item label="描述" name="desc" className="form-item">
                    <Input.TextArea rows={8} />
                  </Form.Item>
                  <Form.Item
                    label={
                      <span>
                        mock严格模式&nbsp;
                        <Tooltip title="开启后 mock 请求会对 query、body form 必填字段和 json schema 进行校验">
                          <QuestionCircleOutlined />
                        </Tooltip>
                      </span>
                    }
                    name="strice"
                    valuePropName="checked"
                    className="form-item"
                  >
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                  </Form.Item>
                  <Form.Item
                    label={
                      <span>
                        开启json5&nbsp;
                        <Tooltip title="开启后可在接口 body 和返回值中写 json 字段">
                          <QuestionCircleOutlined />
                        </Tooltip>
                      </span>
                    }
                    name="is_json5"
                    valuePropName="checked"
                    className="form-item"
                  >
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                  </Form.Item>
                  <Form.Item label="默认开启消息通知" name="switch_notice" valuePropName="checked" className="form-item">
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                  </Form.Item>
                  <Form.Item label="权限" name="project_type" className="form-item">
                    <Radio.Group
                      className="legacy-project-permission-group"
                      value={projectType}
                      onChange={event => setProjectType(event.target.value)}
                    >
                      <Radio value="private">
                        <LockOutlined /> 私有
                        <div className="legacy-radio-desc">只有组长和项目开发者可以索引并查看项目信息</div>
                      </Radio>
                      {canPublicProject ? (
                        <Radio value="public">
                          <UnlockOutlined /> 公开
                          <div className="legacy-radio-desc">任何人都可以索引并查看项目信息</div>
                        </Radio>
                      ) : null}
                    </Radio.Group>
                  </Form.Item>
                </Form>

                <div className="legacy-setting-actions">
                  <Button className="btn-save" type="primary" size="large" onClick={() => void projectForm.submit()} loading={updateState.isLoading}>
                    保 存
                  </Button>
                </div>

                {canDeleteProject ? (
                  <div className="legacy-danger-zone">
                    <div className="legacy-group-danger-header">
                      <div className="legacy-group-danger-title">
                        <QuestionCircleOutlined />
                        危险操作
                      </div>
                    </div>
                    <Card className="card-danger">
                      <div className="card-danger-content">
                        <h3>删除项目</h3>
                        <p className="legacy-group-danger-desc">项目一旦删除，将无法恢复数据，请慎重操作。</p>
                        <p className="legacy-group-danger-desc">只有组长和管理员有权限删除项目。</p>
                      </div>
                      <Button type="primary" danger ghost className="card-danger-btn" onClick={() => setDeleteModalOpen(true)}>
                        删除
                      </Button>
                    </Card>
                  </div>
                ) : null}
              </SectionCard>
            )
          },
          {
            key: 'env',
            label: '环境配置',
            children: (
              <SectionCard className="m-panel legacy-project-setting-card">
                <Space direction="vertical" className="legacy-workspace-stack">
                  <Space>
                    <Button
                      onClick={() =>
                        setEnvEditors(prev => [
                          ...prev,
                          {
                            key: `${Date.now()}-${prev.length}`,
                            name: '新环境',
                            domain: '',
                            headerText: '[]',
                            globalText: '[]'
                          }
                        ])
                      }
                    >
                      添加环境
                    </Button>
                    <Button
                      type="primary"
                      onClick={() => void handleSaveEnv()}
                      loading={updateEnvState.isLoading}
                    >
                      保存环境
                    </Button>
                  </Space>
                  {envEditors.length === 0 ? <Alert type="info" showIcon message="暂无环境，点击“添加环境”开始配置。" /> : null}
                  {envEditors.map((item, index) => (
                    <Card
                      key={item.key}
                      title={`环境 ${index + 1}`}
                      extra={
                        <Button
                          danger
                          onClick={() => setEnvEditors(prev => prev.filter((_, i) => i !== index))}
                        >
                          删除
                        </Button>
                      }
                    >
                      <Space direction="vertical" className="legacy-workspace-stack">
                        <Input
                          value={item.name}
                          onChange={event =>
                            setEnvEditors(prev =>
                              prev.map((env, i) => (i === index ? { ...env, name: event.target.value } : env))
                            )
                          }
                          placeholder="环境名称"
                        />
                        <Input
                          value={item.domain}
                          onChange={event =>
                            setEnvEditors(prev =>
                              prev.map((env, i) => (i === index ? { ...env, domain: event.target.value } : env))
                            )
                          }
                          placeholder="环境域名"
                        />
                        <Text type="secondary">Header(JSON 数组)</Text>
                        <Input.TextArea
                          rows={4}
                          value={item.headerText}
                          onChange={event =>
                            setEnvEditors(prev =>
                              prev.map((env, i) =>
                                i === index ? { ...env, headerText: event.target.value } : env
                              )
                            )
                          }
                        />
                        <Text type="secondary">Global(JSON 数组)</Text>
                        <Input.TextArea
                          rows={4}
                          value={item.globalText}
                          onChange={event =>
                            setEnvEditors(prev =>
                              prev.map((env, i) =>
                                i === index ? { ...env, globalText: event.target.value } : env
                              )
                            )
                          }
                        />
                      </Space>
                    </Card>
                  ))}
                </Space>
              </SectionCard>
            )
          },
          {
            key: 'request',
            label: '请求配置',
            children: (
              <SectionCard className="m-panel legacy-project-setting-card">
                <Form<RequestForm> form={requestForm} layout="vertical">
                  <Form.Item label="Pre-request Script(请求参数处理脚本)" name="pre_script">
                    <Input.TextArea rows={10} />
                  </Form.Item>
                  <Form.Item label="Pre-response Script(响应数据处理脚本)" name="after_script">
                    <Input.TextArea rows={10} />
                  </Form.Item>
                  <div className="legacy-setting-actions">
                    <Button className="btn-save" type="primary" size="large" onClick={() => void handleSaveRequest()} loading={updateState.isLoading}>
                      保 存
                    </Button>
                  </div>
                </Form>
              </SectionCard>
            )
          },
          ...(project?.role !== 'guest'
            ? [
              {
                key: 'token',
                label: 'Token 配置',
                children: (
                  <SectionCard className="m-panel legacy-project-setting-card">
                    <Space direction="vertical" className="legacy-workspace-stack">
                      <Text strong>工具标识</Text>
                      <Text type="secondary">
                        每个项目都有唯一 token，可用于请求项目 openapi。
                      </Text>
                      <Input value={String(tokenQuery.data?.data || '')} readOnly />
                      <Space>
                        <Button onClick={handleCopyToken}>复制 token</Button>
                        {canDeleteProject ? (
                          <Button onClick={handleRegenerateToken} loading={updateTokenState.isLoading}>
                            重新生成
                          </Button>
                        ) : null}
                        <Button onClick={() => tokenQuery.refetch()}>刷新</Button>
                      </Space>
                      <Text strong className="legacy-workspace-text-top">
                        Open 接口
                      </Text>
                      <Text type="secondary">
                        详细说明请查看 OpenAPI 文档，以下为常用接口：
                      </Text>
                      <ul className="legacy-open-api-list">
                        <li>/api/open/run_auto_test</li>
                        <li>/api/open/import_data</li>
                        <li>/api/interface/add</li>
                        <li>/api/interface/save</li>
                        <li>/api/interface/up</li>
                        <li>/api/interface/get</li>
                        <li>/api/interface/list</li>
                        <li>/api/interface/list_menu</li>
                        <li>/api/interface/tree</li>
                        <li>/api/interface/tree/node</li>
                        <li>/api/interface/add_cat</li>
                        <li>/api/interface/getCatMenu</li>
                        <li>/api/spec/import</li>
                        <li>/api/spec/import/task</li>
                        <li>/api/spec/import/tasks</li>
                        <li>/api/spec/import/task/download</li>
                        <li>/api/spec/export</li>
                      </ul>
                    </Space>
                  </SectionCard>
                )
              }
            ]
            : []),
          {
            key: 'mock',
            label: '全局mock脚本',
            children: (
              <SectionCard className="m-panel legacy-project-setting-card">
                <Form<MockForm> form={mockForm} layout="vertical">
                  <Form.Item label="是否开启" name="is_mock_open" valuePropName="checked">
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                  </Form.Item>
                  <Form.Item label="Mock脚本" name="project_mock_script">
                    <Input.TextArea rows={16} />
                  </Form.Item>
                  <div className="legacy-setting-actions">
                    <Button className="btn-save" type="primary" size="large" onClick={() => void handleSaveMock()} loading={updateState.isLoading}>
                      保 存
                    </Button>
                  </div>
                </Form>
              </SectionCard>
            )
          },
          ...Object.keys(pluginSettingTabs).map(key => {
            const tab = pluginSettingTabs[key];
            const C = tab.component;
            return {
              key: `plugin_${key}`,
              label: tab.name,
              children: (
                <SectionCard className="legacy-project-setting-card">
                  <C projectId={props.projectId} />
                </SectionCard>
              )
            };
          })
        ]}
      />

      <Modal
        title={`确认删除 ${projectName} 项目吗？`}
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        }}
        onOk={() => void handleDeleteProject()}
        okText="确认删除"
        okButtonProps={{ danger: true, loading: delState.isLoading }}
      >
        <Space direction="vertical" className="legacy-workspace-stack">
          <Alert
            type="warning"
            showIcon
            message="该操作会删除项目下所有接口与相关数据，且无法恢复。"
          />
          <Text>请输入项目名称以确认删除：</Text>
          <Input
            value={deleteConfirmText}
            onChange={event => setDeleteConfirmText(event.target.value)}
          />
        </Space>
      </Modal>
    </div>
  );
}
