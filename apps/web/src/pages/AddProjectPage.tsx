import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Divider, Radio, Select, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconHelpCircle, IconLock, IconPlus } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAddProjectMutation,
  useGetGroupListQuery,
  useGetMyGroupQuery
} from '../services/yapi-api';
import { randomProjectColorKey, randomProjectIconKey } from '../utils/project-visual';
import { AppShell, PageHeader, SectionCard } from '../components/layout';

type CreateProjectForm = {
  name: string;
  group_id: string;
  basepath: string;
  desc: string;
  project_type: 'private' | 'public';
};

type FormErrors = Partial<Record<keyof CreateProjectForm, string>>;

function normalizeBasepath(input: string | undefined): string {
  const value = String(input || '').trim();
  if (!value) return '';
  if (value === '/') return '';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+$/, '');
}

function legacyLength(input: string): number {
  let length = 0;
  for (let i = 0; i < input.length; i += 1) {
    length += input.charCodeAt(i) > 255 ? 2 : 1;
  }
  return length;
}

function validate(values: CreateProjectForm): FormErrors {
  const errors: FormErrors = {};
  const name = values.name.trim();
  if (!name || legacyLength(name) > 100) {
    errors.name = '请输入项目名称，长度不超过100字符(中文算作2字符)';
  }
  if (!values.group_id) {
    errors.group_id = '请选择项目所属分组';
  }
  if (values.desc.trim().length > 144) {
    errors.desc = '描述不超过 144 字';
  }
  return errors;
}

export function AddProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [values, setValues] = useState<CreateProjectForm>({
    name: '',
    group_id: '',
    basepath: '',
    desc: '',
    project_type: 'private'
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [addProject, addState] = useAddProjectMutation();
  const groupListQuery = useGetGroupListQuery();
  const myGroupQuery = useGetMyGroupQuery();

  const groupOptions = useMemo(() => {
    const list = groupListQuery.data?.data || [];
    return list.map(item => ({
      value: String(item._id),
      label: item.group_name,
      disabled: !/(admin|owner|dev)/.test(String(item.role || ''))
    }));
  }, [groupListQuery.data]);

  useEffect(() => {
    if (groupOptions.length === 0 || values.group_id) return;
    const routeGroupId = searchParams.get('group_id');
    if (routeGroupId) {
      const target = groupOptions.find(item => item.value === routeGroupId && !item.disabled);
      if (target) {
        setValues(current => ({ ...current, group_id: target.value }));
        return;
      }
    }
    const lastGroupId = window.localStorage.getItem('yapi_last_group_id') || '';
    if (lastGroupId) {
      const target = groupOptions.find(item => item.value === lastGroupId && !item.disabled);
      if (target) {
        setValues(current => ({ ...current, group_id: target.value }));
        return;
      }
    }
    const firstEnabled = groupOptions.find(item => !item.disabled) || groupOptions[0];
    if (firstEnabled) {
      setValues(current => ({ ...current, group_id: firstEnabled.value }));
    }
  }, [groupOptions, searchParams, values.group_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const response = await addProject({
        name: values.name.trim(),
        group_id: Number(values.group_id),
        basepath: normalizeBasepath(values.basepath),
        desc: values.desc.trim(),
        color: randomProjectColorKey(),
        icon: randomProjectIconKey(),
        project_type: values.project_type
      }).unwrap();
      if (response.errcode !== 0) {
        notifications.show({ color: 'red', message: response.errmsg || '创建项目失败' });
        return;
      }
      notifications.show({ color: 'teal', message: '创建成功' });
      const projectId = Number(response.data?._id || 0);
      if (projectId > 0) {
        navigate(`/project/${projectId}/interface/api`);
        return;
      }
      const myGroupId = Number(myGroupQuery.data?.data?._id || 0);
      navigate(myGroupId > 0 ? `/group/${myGroupId}` : '/group');
    } catch (error) {
      notifications.show({
        color: 'red',
        message: (error as Error)?.message || '创建项目失败，请稍后重试'
      });
    }
  }

  return (
    <AppShell className="legacy-add-project-page">
      <PageHeader
        title="新建项目"
        subtitle="填写基础信息后立即进入接口工作区，后续可在项目设置中继续完善。"
        actions={(
          <Button
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate('/group')}
          >
            返回分组
          </Button>
        )}
      />

      <SectionCard className="legacy-add-project-card">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <TextInput
              label="项目名称"
              placeholder="例如：支付中心 API"
              value={values.name}
              onChange={event => setValues(current => ({ ...current, name: event.currentTarget.value }))}
              error={errors.name}
              required
            />
            <Select
              label="所属分组"
              placeholder="选择分组"
              data={groupOptions}
              value={values.group_id || null}
              onChange={value => setValues(current => ({ ...current, group_id: value || '' }))}
              error={errors.group_id}
              disabled={groupListQuery.isLoading}
              searchable
              nothingFoundMessage="没有可用分组"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextInput
              label={
                <div className="inline-flex items-center gap-1">
                  <span>基本路径</span>
                  <Tooltip label="接口基本路径，为空时默认根路径 /">
                    <span className="inline-flex cursor-help text-slate-400">
                      <IconHelpCircle size={16} />
                    </span>
                  </Tooltip>
                </div>
              }
              placeholder="/api/v1"
              value={values.basepath}
              onChange={event => setValues(current => ({ ...current, basepath: event.currentTarget.value }))}
              onBlur={event => {
                setValues(current => ({
                  ...current,
                  basepath: normalizeBasepath(event.currentTarget.value)
                }));
              }}
            />

            <div className="space-y-2">
              <Text fw={500} size="sm">
                权限
              </Text>
              <Radio.Group
                value={values.project_type}
                onChange={value => setValues(current => ({ ...current, project_type: value as 'private' | 'public' }))}
              >
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Radio
                    value="private"
                    label={
                      <div className="flex items-center gap-2">
                        <IconLock size={16} />
                        <span>私有项目</span>
                      </div>
                    }
                  />
                </div>
              </Radio.Group>
            </div>
          </div>

          <Textarea
            label="描述"
            minRows={5}
            autosize
            placeholder="简要说明项目职责、接口范围或协作约定。"
            value={values.desc}
            onChange={event => setValues(current => ({ ...current, desc: event.currentTarget.value }))}
            error={errors.desc}
          />

          <Divider />

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={addState.isLoading}
              leftSection={<IconPlus size={16} />}
            >
              创建并进入项目
            </Button>
          </div>
        </form>
      </SectionCard>
    </AppShell>
  );
}
