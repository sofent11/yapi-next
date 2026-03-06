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
  Tooltip,
  Typography,
  message,
} from 'antd';
import { LockOutlined, QuestionCircleOutlined, UnlockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  useDelProjectMutation,
  useGetGroupListQuery,
  useGetProjectQuery,
  useUpdateProjectMutation,
  useUpsetProjectMutation
} from '../../../services/yapi-api';
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  renderProjectIcon,
  resolveProjectColor,
  resolveProjectColorKey
} from '../../../utils/project-visual';
import { legacyNameValidator } from '../../../utils/legacy-validation';
import { SectionCard } from '../../../components/layout';
import type { ProjectForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const { Text } = Typography;

export function SettingGeneralTab(props: ProjectSettingPageProps) {
  const navigate = useNavigate();
  const [projectForm] = Form.useForm<ProjectForm>();
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const groupListQuery = useGetGroupListQuery();
  const [updateProject, updateState] = useUpdateProjectMutation();
  const [upsetProject, upsetState] = useUpsetProjectMutation();
  const [delProject, delState] = useDelProjectMutation();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [projectType, setProjectType] = useState<'public' | 'private'>('private');

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
  }, [detailQuery.data, projectForm]);

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
    </SectionCard>
  );
}
