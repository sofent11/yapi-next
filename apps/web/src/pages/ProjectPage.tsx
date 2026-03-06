import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import { Badge, Button, Group, Loader } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGetGroupQuery, useGetProjectQuery } from '../services/yapi-api';
import { webPlugins, type SubNavItem } from '../plugins';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';

const BUILT_IN_NAV_KEYS = new Set(['interface', 'activity', 'data', 'members', 'setting']);

function createLazyProjectPage(
  loader: () => Promise<{ default: ComponentType<any> }>
): ComponentType<any> {
  const LazyComponent = lazy(loader);
  return function RouteComponentWrapper(props: Record<string, unknown>) {
    return <LazyComponent {...props} />;
  };
}

const ProjectInterfacePage = createLazyProjectPage(() =>
  import('./project/ProjectInterfacePage').then(mod => ({ default: mod.ProjectInterfacePage }))
);
const ProjectActivityPage = createLazyProjectPage(() =>
  import('./project/ProjectActivityPage').then(mod => ({ default: mod.ProjectActivityPage }))
);
const ProjectDataPage = createLazyProjectPage(() =>
  import('./project/ProjectDataPage').then(mod => ({ default: mod.ProjectDataPage }))
);
const ProjectMembersPage = createLazyProjectPage(() =>
  import('./project/ProjectMembersPage').then(mod => ({ default: mod.ProjectMembersPage }))
);
const ProjectSettingPage = createLazyProjectPage(() =>
  import('./project/ProjectSettingPage').then(mod => ({ default: mod.ProjectSettingPage }))
);

function normalizeProjectPath(path: string, projectId: number): string {
  return path.replace(/:id\b/g, String(projectId));
}

export function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id || 0);
  const location = useLocation();
  const navigate = useNavigate();

  const projectQuery = useGetProjectQuery({ projectId }, { skip: projectId <= 0 });
  const project = projectQuery.data?.data;
  const projectGroupId = Number(project?.group_id || 0);
  const groupQuery = useGetGroupQuery({ id: projectGroupId }, { skip: projectGroupId <= 0 });
  const group = groupQuery.data?.data;
  const hideMembers = group?.type === 'private';

  const subNavMap = useMemo<Record<string, SubNavItem>>(() => {
    const routes: Record<string, SubNavItem> = {
      interface: {
        name: '接口',
        path: `/project/${projectId}/interface/api`
      },
      activity: {
        name: '动态',
        path: `/project/${projectId}/activity`
      },
      data: {
        name: '数据管理',
        path: `/project/${projectId}/data`
      },
      members: {
        name: '成员管理',
        path: `/project/${projectId}/members`
      },
      setting: {
        name: '设置',
        path: `/project/${projectId}/setting`
      }
    };
    webPlugins.applySubNav(routes, { projectId });

    const normalized: Record<string, SubNavItem> = {};
    Object.keys(routes).forEach(key => {
      const item = routes[key];
      normalized[key] = {
        ...item,
        path: normalizeProjectPath(item.path, projectId)
      };
    });

    if (hideMembers) {
      delete normalized.members;
    }
    return normalized;
  }, [hideMembers, projectId]);

  const pluginRouteItems = useMemo(
    () =>
      Object.keys(subNavMap)
        .filter(key => !BUILT_IN_NAV_KEYS.has(key))
        .map(key => {
          const item = subNavMap[key];
          if (!item.component) return null;
          const projectPrefix = `/project/${projectId}/`;
          let relative = item.path || '';
          if (relative.startsWith(projectPrefix)) {
            relative = relative.slice(projectPrefix.length);
          }
          if (relative.startsWith('/')) {
            relative = relative.slice(1);
          }
          if (!relative) return null;
          return {
            key,
            path: relative,
            component: item.component
          };
        })
        .filter(Boolean) as Array<{ key: string; path: string; component: NonNullable<SubNavItem['component']> }>,
    [subNavMap, projectId]
  );

  const activeKey = useMemo(() => {
    const path = location.pathname;
    const entries = Object.entries(subNavMap);

    for (const [key, item] of entries) {
      if (!item.path) continue;
      if (path === item.path || path.startsWith(`${item.path}/`)) {
        return key;
      }
      if (key === 'interface' && path.includes(`/project/${projectId}/interface/`)) {
        return key;
      }
    }

    const fallback = entries.find(([key]) => key === 'interface')?.[0];
    return fallback || entries[0]?.[0] || 'interface';
  }, [location.pathname, projectId, subNavMap]);

  if (projectId <= 0) {
    return <Navigate to="/group" replace />;
  }

  if (projectQuery.isLoading && !project) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <AppShell className="project-page-root">
      <PageHeader
        eyebrow="项目工作区"
        title={String(project?.name || `项目 #${projectId}`)}
        subtitle={
          project?.basepath
            ? `BasePath: ${project.basepath}`
            : '接口、测试、数据与成员配置统一管理'
        }
        meta={
          <Group gap={8}>
            <Badge variant="light" color="blue" radius="xl">
              {group?.group_name || '未分组项目'}
            </Badge>
            {project?.role ? <Badge variant="light" color="gray" radius="xl">{`角色：${project.role}`}</Badge> : null}
            <Badge variant="light" color={hideMembers ? 'gray' : 'teal'} radius="xl">
              {hideMembers ? '私有成员模式' : '团队协作模式'}
            </Badge>
          </Group>
        }
        actions={
          projectGroupId > 0 ? (
            <Button
              leftSection={<IconArrowLeft size={16} />}
              variant="light"
              onClick={() => navigate(`/group/${projectGroupId}`)}
            >
              返回分组
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-sm">
        {Object.keys(subNavMap).map(key => {
          const item = subNavMap[key];
          const active = key === activeKey;
          return (
            <Button
              key={key}
              component={Link}
              to={item.path}
              variant={active ? 'filled' : 'light'}
              color={active ? 'blue' : 'gray'}
              radius="xl"
            >
              {item.name}
            </Button>
          );
        })}
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader />
          </div>
        }
      >
        <Routes>
          <Route index element={<Navigate to={`/project/${projectId}/interface/api`} replace />} />
          <Route
            path="interface/:action/:actionId?"
            element={
              <ProjectInterfacePage
                projectId={projectId}
                basepath={project?.basepath}
                projectRole={project?.role}
                projectGroupId={projectGroupId}
                projectTag={Array.isArray((project as unknown as Record<string, unknown> | undefined)?.tag) ? ((project as unknown as Record<string, unknown>).tag as Array<{ name?: string; desc?: string }>) : []}
                projectSwitchNotice={Boolean((project as unknown as Record<string, unknown> | undefined)?.switch_notice)}
                projectIsJson5={Boolean((project as unknown as Record<string, unknown> | undefined)?.is_json5)}
                projectIsMockOpen={Boolean((project as unknown as Record<string, unknown> | undefined)?.is_mock_open)}
                projectStrict={Boolean((project as unknown as Record<string, unknown> | undefined)?.strice)}
                customField={groupQuery.data?.data?.custom_field1 as { name?: string; enable?: boolean } | undefined}
              />
            }
          />
          <Route path="activity" element={<ProjectActivityPage projectId={projectId} />} />
          <Route path="data" element={<ProjectDataPage projectId={projectId} />} />
          {!hideMembers ? (
            <Route path="members" element={<ProjectMembersPage projectId={projectId} />} />
          ) : null}
          <Route path="setting" element={<ProjectSettingPage projectId={projectId} />} />
          {pluginRouteItems.map(item => {
            const C = item.component;
            return <Route key={item.key} path={item.path} element={<C />} />;
          })}
          <Route path="*" element={<Navigate to={`/project/${projectId}/interface/api`} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
