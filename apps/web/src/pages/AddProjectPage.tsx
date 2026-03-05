import { useEffect, useMemo } from 'react';
import { Button, Col, Divider, Form, Input, Radio, Row, Select, Space, Tooltip, message } from 'antd';
import { ArrowLeftOutlined, LockOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAddProjectMutation,
  useGetGroupListQuery,
  useGetMyGroupQuery
} from '../services/yapi-api';
import { randomProjectColorKey, randomProjectIconKey } from '../utils/project-visual';
import { AppShell, PageHeader, SectionCard } from '../components/layout';
import { legacyNameValidator } from '../utils/legacy-validation';

type CreateProjectForm = {
  name: string;
  group_id: number;
  basepath?: string;
  desc?: string;
  project_type: 'private' | 'public';
};

function normalizeBasepath(input: string | undefined): string {
  const value = String(input || '').trim();
  if (!value) return '';
  if (value === '/') return '';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+$/, '');
}

export function AddProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<CreateProjectForm>();
  const [addProject, addState] = useAddProjectMutation();
  const groupListQuery = useGetGroupListQuery();
  const myGroupQuery = useGetMyGroupQuery();

  const groupOptions = useMemo(() => {
    const list = groupListQuery.data?.data || [];
    return list.map(item => ({
      value: item._id,
      label: item.group_name,
      disabled: !/(admin|owner|dev)/.test(String(item.role || ''))
    }));
  }, [groupListQuery.data]);

  useEffect(() => {
    if (groupOptions.length === 0) return;
    const current = form.getFieldValue('group_id');
    if (current) return;
    const routeGroupId = Number(searchParams.get('group_id') || 0);
    if (routeGroupId > 0) {
      const target = groupOptions.find(item => Number(item.value) === routeGroupId && !item.disabled);
      if (target) {
        form.setFieldValue('group_id', target.value);
        return;
      }
    }
    const lastGroupId = Number(window.localStorage.getItem('yapi_last_group_id') || 0);
    if (lastGroupId > 0) {
      const target = groupOptions.find(item => Number(item.value) === lastGroupId && !item.disabled);
      if (target) {
        form.setFieldValue('group_id', target.value);
        return;
      }
    }
    const firstEnabled = groupOptions.find(item => !item.disabled);
    form.setFieldValue('group_id', firstEnabled?.value ?? groupOptions[0].value);
  }, [form, groupOptions, searchParams]);

  async function handleSubmit(values: CreateProjectForm) {
    try {
      const response = await addProject({
        name: values.name.trim(),
        group_id: Number(values.group_id),
        basepath: normalizeBasepath(values.basepath),
        desc: values.desc?.trim() || '',
        color: randomProjectColorKey(),
        icon: randomProjectIconKey(),
        project_type: values.project_type
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '创建项目失败');
        return;
      }
      message.success('创建成功! ');
      const projectId = Number(response.data?._id || 0);
      if (projectId > 0) {
        navigate(`/project/${projectId}/interface/api`);
        return;
      }
      const myGroupId = Number(myGroupQuery.data?.data?._id || 0);
      navigate(myGroupId > 0 ? `/group/${myGroupId}` : '/group');
    } catch (error) {
      message.error((error as Error)?.message || '创建项目失败，请稍后重试');
    }
  }

  return (
    <AppShell className="legacy-add-project-page">
      <PageHeader
        title="新建项目"
        subtitle="填写基础信息后立即进入接口工作区，后续可在项目设置中继续完善。"
        actions={(
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/group')}>
            返回分组
          </Button>
        )}
      />

      <SectionCard className="legacy-add-project-card">
        <Form<CreateProjectForm>
          form={form}
          layout="vertical"
          className="legacy-add-project-form"
          onFinish={handleSubmit}
          initialValues={{
            project_type: 'private',
            basepath: ''
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item
                label="项目名称"
                name="name"
                rules={[{ required: true, validator: legacyNameValidator('项目') }]}
              >
                <Input placeholder="例如：支付中心 API" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item
                label="所属分组"
                name="group_id"
                rules={[{ required: true, message: '请选择项目所属分组' }]}
              >
                <Select options={groupOptions} loading={groupListQuery.isLoading} placeholder="选择分组" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={(
                  <Space size={4}>
                    基本路径
                    <Tooltip title="接口基本路径，为空时默认根路径 /">
                      <QuestionCircleOutlined />
                    </Tooltip>
                  </Space>
                )}
                name="basepath"
              >
                <Input
                  placeholder="/api/v1"
                  onBlur={event => {
                    form.setFieldValue('basepath', normalizeBasepath(event.target.value));
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="权限" name="project_type" rules={[{ required: true }]}>
                <Radio.Group className="legacy-add-project-permission-group">
                  <Radio.Button value="private">
                    <LockOutlined />
                    <span>私有项目</span>
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="描述"
            name="desc"
            rules={[{ required: false, message: '描述不超过 144 字', max: 144 }]}
          >
            <Input.TextArea rows={5} placeholder="简要说明项目职责、接口范围或协作约定。" />
          </Form.Item>

          <Divider className="legacy-add-project-divider" />

          <div className="legacy-add-project-submit">
            <Button
              icon={<PlusOutlined />}
              type="primary"
              htmlType="submit"
              loading={addState.isLoading}
            >
              创建并进入项目
            </Button>
          </div>
        </Form>
      </SectionCard>
    </AppShell>
  );
}
