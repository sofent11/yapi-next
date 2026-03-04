import { useEffect, useMemo } from 'react';
import { Button, Form, Input, Radio, Select, Space, Tooltip, Row, Col, message } from 'antd';
import { LockOutlined, QuestionCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAddProjectMutation,
  useGetGroupListQuery,
  useGetMyGroupQuery
} from '../services/yapi-api';
import { randomProjectColorKey, randomProjectIconKey } from '../utils/project-visual';
import { legacyNameValidator } from '../utils/legacy-validation';
import './Addproject.scss';

type CreateProjectForm = {
  name: string;
  group_id: number;
  basepath?: string;
  desc?: string;
  project_type: 'private' | 'public';
};

const formItemLayout = {
  labelCol: {
    lg: { span: 3 },
    xs: { span: 24 },
    sm: { span: 6 }
  },
  wrapperCol: {
    lg: { span: 21 },
    xs: { span: 24 },
    sm: { span: 14 }
  },
  className: 'form-item'
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
  }

  return (
    <div className="g-row">
      <div className="g-row m-container">
        <Form<CreateProjectForm>
          form={form}
          layout="horizontal"
          onFinish={handleSubmit}
          initialValues={{
            project_type: 'private',
            basepath: ''
          }}
        >
          <Form.Item
            {...formItemLayout}
            label="项目名称"
            name="name"
            rules={[{ required: true, validator: legacyNameValidator('项目') }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            {...formItemLayout}
            label="所属分组"
            name="group_id"
            rules={[{ required: true, message: '请选择项目所属的分组!' }]}
          >
            <Select options={groupOptions} loading={groupListQuery.isLoading} />
          </Form.Item>

          <hr className="breakline" />

          <Form.Item
            {...formItemLayout}
            label={
              <span>
                基本路径&nbsp;
                <Tooltip title="接口基本路径，为空是根路径">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
            name="basepath"
            rules={[{ required: false, message: '请输入项目基本路径' }]}
          >
            <Input
              onBlur={event => {
                form.setFieldValue('basepath', normalizeBasepath(event.target.value));
              }}
            />
          </Form.Item>

          <Form.Item
            {...formItemLayout}
            label="描述"
            name="desc"
            rules={[{ required: false, message: '描述不超过144字!', max: 144 }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>

          <Form.Item
            {...formItemLayout}
            label="权限"
            name="project_type"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="private" className="radio">
                <LockOutlined />私有<br />
                <span className="radio-desc">只有组长和项目开发者可以索引并查看项目信息</span>
              </Radio>
              <br />
              {/* <Radio value="public" className="radio">
                <Icon type="unlock" />公开<br />
                <span className="radio-desc">任何人都可以索引并查看项目信息</span>
              </Radio> */}
            </Radio.Group>
          </Form.Item>

          <Row>
            <Col sm={{ offset: 6 }} lg={{ offset: 3 }}>
              <Button
                className="m-btn"
                icon={<PlusOutlined />}
                type="primary"
                htmlType="submit"
                loading={addState.isLoading}
              >
                创建项目
              </Button>
            </Col>
          </Row>
        </Form>
      </div>
    </div>
  );
}
