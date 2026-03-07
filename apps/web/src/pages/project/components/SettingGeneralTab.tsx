import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Modal,
  Popover,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHelpCircle, IconLock, IconLockOpen } from '@tabler/icons-react';
import RcForm, { Field, useForm as useRcForm } from 'rc-field-form';
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
import { createNameValidator } from '../../../utils/name-validator';
import { ProjectSettingsActions } from '../../../domains/project/ProjectSettingsActions';
import { ProjectSettingsIntro } from '../../../domains/project/ProjectSettingsIntro';
import { ProjectSettingsPanel } from '../../../domains/project/ProjectSettingsPanel';
import type { ProjectForm, ProjectSettingPageProps } from '../ProjectSettingPage.types';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  }
};

export function SettingGeneralTab(props: ProjectSettingPageProps) {
  const navigate = useNavigate();
  const [projectForm] = useRcForm<ProjectForm>();
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
        value: String(Number(item._id || 0)),
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
  const projectVisualColorClass = projectVisualColorKey ? `project-color-${projectVisualColorKey}` : '';

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
    <ProjectSettingsPanel>
      <div className="project-settings-hero project-settings-hero-card">
        <Popover width={360} position="bottom" shadow="md">
          <Popover.Target>
            <button type="button" className="project-settings-logo-btn">
              <span
                className={`project-settings-logo ${projectVisualColorClass}`.trim()}
                title="点击修改项目图标和颜色"
                style={projectVisualColorClass ? undefined : { backgroundColor: projectVisualColor }}
              >
                {renderProjectIcon(projectIconKey)}
              </span>
              <span className="project-settings-logo-mask">点击修改</span>
            </button>
          </Popover.Target>
          <Popover.Dropdown className="project-settings-visual-popover">
            <Stack gap="md">
              <div>
                <Text fw={600} mb="xs">颜色</Text>
                <div className="project-settings-color-group flex flex-wrap gap-2">
                  {PROJECT_COLOR_OPTIONS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className={`project-settings-color-option project-color-${item}`}
                      onClick={() => void handleChangeProjectColor(item)}
                      disabled={upsetState.isLoading}
                    >
                      {projectColorKey === item ? '✓' : null}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Text fw={600} mb="xs">图标</Text>
                <div className="project-settings-icon-group flex flex-wrap gap-2">
                  {PROJECT_ICON_OPTIONS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className="project-settings-icon-option"
                      onClick={() => void handleChangeProjectIcon(item)}
                      disabled={upsetState.isLoading}
                    >
                      {renderProjectIcon(item)}
                    </button>
                  ))}
                </div>
              </div>
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <div className="project-settings-hero-info">
          <h2 className="project-settings-hero-title">
            {(currentGroupName ? `${currentGroupName} / ` : '') + (project?.name || '')}
          </h2>
          <Text c="dimmed">点击图标可调整项目视觉样式，帮助团队更快识别项目。</Text>
        </div>
      </div>
      <ProjectSettingsIntro title="这里维护项目基础信息、访问权限与行为开关，调整公开权限前请先确认协作范围。" />
      <hr className="project-settings-divider" />

      <RcForm<ProjectForm> className="project-settings-form" form={projectForm} onFinish={handleSubmit}>
        <Stack gap="md">
          <div className="form-item">
            <Text fw={500}>项目ID</Text>
            <Text>{String(project?._id || '-')}</Text>
          </div>
          <Field<ProjectForm> name="name" rules={[{ required: true, validator: createNameValidator('项目') }]}>
            {(control, meta) => (
              <TextInput
                label="项目名称"
                value={control.value ?? ''}
                onChange={event => control.onChange(event.currentTarget.value)}
                error={meta.errors[0]}
                placeholder="例如：支付中心 API…"
              />
            )}
          </Field>
          <Field<ProjectForm> name="group_id" rules={[{ required: true, message: '请选择所属分组' }]}>
            {(control, meta) => (
              <Select
                label="所属分组"
                value={control.value ? String(control.value) : null}
                onChange={value => control.onChange(value ? Number(value) : undefined)}
                data={groupOptions}
                disabled={!canChangeProjectGroup}
                placeholder="请选择所属分组…"
                error={meta.errors[0]}
              />
            )}
          </Field>
          <Field<ProjectForm> name="basepath">
            {(control) => (
              <TextInput
                label={
                  <span className="inline-flex items-center gap-1">
                    接口基本路径
                    <Tooltip label="基本路径为空表示根路径">
                      <IconHelpCircle size={16} />
                    </Tooltip>
                  </span>
                }
                value={control.value ?? ''}
                onChange={event => control.onChange(event.currentTarget.value)}
                placeholder="/api/v1…"
              />
            )}
          </Field>
          <TextInput
            label={
              <span className="inline-flex items-center gap-1">
                MOCK地址
                <Tooltip label="具体使用方法请查看文档">
                  <IconHelpCircle size={16} />
                </Tooltip>
              </span>
            }
            value={mockUrl}
            readOnly
          />
          <Field<ProjectForm> name="desc">
            {(control) => (
              <Textarea
                label="描述"
                minRows={8}
                value={control.value ?? ''}
                onChange={event => control.onChange(event.currentTarget.value)}
                placeholder="简要说明项目职责、接口范围或协作说明…"
              />
            )}
          </Field>
          <Field<ProjectForm> name="strice" valuePropName="checked">
            {(control) => (
              <Switch
                label={
                  <span className="inline-flex items-center gap-1">
                    mock严格模式
                    <Tooltip label="开启后 mock 请求会对 query、body form 必填字段和 json schema 进行校验">
                      <IconHelpCircle size={16} />
                    </Tooltip>
                  </span>
                }
                checked={Boolean(control.value)}
                onChange={event => control.onChange(event.currentTarget.checked)}
              />
            )}
          </Field>
          <Field<ProjectForm> name="is_json5" valuePropName="checked">
            {(control) => (
              <Switch
                label={
                  <span className="inline-flex items-center gap-1">
                    开启json5
                    <Tooltip label="开启后可在接口 body 和返回值中写 json 字段">
                      <IconHelpCircle size={16} />
                    </Tooltip>
                  </span>
                }
                checked={Boolean(control.value)}
                onChange={event => control.onChange(event.currentTarget.checked)}
              />
            )}
          </Field>
          <Field<ProjectForm> name="switch_notice" valuePropName="checked">
            {(control) => (
              <Switch
                label="默认开启消息通知"
                checked={Boolean(control.value)}
                onChange={event => control.onChange(event.currentTarget.checked)}
              />
            )}
          </Field>
          <Field<ProjectForm> name="project_type">
            {(control) => (
              <Radio.Group
                label="权限"
                className="project-settings-permission-group"
                value={control.value || projectType}
                onChange={value => {
                  setProjectType(value as 'public' | 'private');
                  control.onChange(value);
                }}
              >
                <Stack gap="sm" mt="xs">
                  <Radio
                    value="private"
                    label={
                      <div>
                        <span className="inline-flex items-center gap-1">
                          <IconLock size={16} /> 私有
                        </span>
                        <div className="project-settings-radio-desc">只有组长和项目开发者可以索引并查看项目信息</div>
                      </div>
                    }
                  />
                  {canPublicProject ? (
                    <Radio
                      value="public"
                      label={
                        <div>
                          <span className="inline-flex items-center gap-1">
                            <IconLockOpen size={16} /> 公开
                          </span>
                          <div className="project-settings-radio-desc">任何人都可以索引并查看项目信息</div>
                        </div>
                      }
                    />
                  ) : null}
                </Stack>
              </Radio.Group>
            )}
          </Field>
        </Stack>
      </RcForm>

      <ProjectSettingsActions>
        <Button className="btn-save" size="md" onClick={() => void projectForm.submit()} loading={updateState.isLoading}>
          保存项目配置
        </Button>
      </ProjectSettingsActions>

      {canDeleteProject ? (
        <div className="project-settings-danger-zone">
          <div className="project-settings-danger-header">
            <div className="project-settings-danger-title">
              <IconHelpCircle size={16} />
              危险操作
            </div>
          </div>
          <Card className="card-danger" withBorder>
            <div className="card-danger-content">
              <h3>删除项目</h3>
              <p className="project-settings-danger-desc">项目一旦删除，将无法恢复数据，请慎重操作。</p>
              <p className="project-settings-danger-desc">只有组长和管理员有权限删除项目。</p>
            </div>
            <Button color="red" variant="outline" className="card-danger-btn" onClick={() => setDeleteModalOpen(true)}>
              删除
            </Button>
          </Card>
        </div>
      ) : null}

      <Modal
        title={`确认删除 ${projectName} 项目吗？`}
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        }}
      >
        <Stack className="workspace-stack">
          <Alert color="yellow" title="该操作会删除项目下所有接口与相关数据，且无法恢复。" />
          <Text>请输入项目名称以确认删除：</Text>
          <TextInput
            value={deleteConfirmText}
            onChange={event => setDeleteConfirmText(event.currentTarget.value)}
            placeholder={`输入 ${projectName} 以确认删除…`}
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="default"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteConfirmText('');
              }}
            >
              取消
            </Button>
            <Button color="red" loading={delState.isLoading} onClick={() => void handleDeleteProject()}>
              确认删除
            </Button>
          </div>
        </Stack>
      </Modal>
    </ProjectSettingsPanel>
  );
}
