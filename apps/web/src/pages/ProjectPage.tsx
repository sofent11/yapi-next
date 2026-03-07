import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGetGroupQuery, useGetProjectQuery } from '../services/yapi-api';
import { webPlugins, type SubNavItem } from '../plugins';
import { AppShell } from '../components/layout/AppShell';
import { AsyncRetryAction, AsyncState } from '../components/patterns/AsyncState';
import { SecondaryNav } from '../components/patterns/SecondaryNav';
import { ProjectHeader } from '../domains/project/ProjectHeader';

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
    return <AsyncState state="loading" title="正在加载项目工作区" description="项目信息与工作区结构正在准备中。" />;
  }

  if (projectQuery.isError && !project) {
    return (
      <AsyncState
        state="error"
        title="项目信息加载失败"
        description="当前无法读取项目元数据，请稍后重试。"
        action={<AsyncRetryAction onRetry={() => void projectQuery.refetch()} />}
      />
    );
  }

  const navItems = Object.keys(subNavMap).map(key => {
    const item = subNavMap[key];
    const descriptions: Record<string, string> = {
      interface: '管理接口目录、查看详情并进入编辑或调试流程。',
      activity: '查看项目级变更日志、操作记录和协作动态。',
      data: '执行 OpenAPI/Swagger 导入导出并跟踪任务状态。',
      members: '维护项目成员、角色和通知配置。',
      setting: '配置项目基础信息、环境变量、Token 和全局 Mock。'
    };
    return {
      key,
      label: item.name,
      to: item.path,
      active: key === activeKey,
      description: descriptions[key] || '进入当前项目的扩展能力页。'
    };
  });

  return (
    <AppShell className="project-page-root">
      <ProjectHeader
        projectId={projectId}
        projectName={project?.name}
        basepath={project?.basepath}
        projectRole={project?.role}
        groupName={group?.group_name}
        isPrivateMode={hideMembers}
        groupId={projectGroupId}
        onBackToGroup={() => navigate(`/group/${projectGroupId}`)}
      />
      <SecondaryNav
        items={navItems}
      />

      <Suspense
        fallback={
          <AsyncState state="loading" title="正在加载模块内容" description="当前模块内容正在准备中。" />
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
