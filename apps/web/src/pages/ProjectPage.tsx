import { useMemo } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Menu, Spin } from 'antd';
import type { MenuProps } from 'antd';
import { useGetGroupQuery, useGetProjectQuery } from '../services/yapi-api';
import { webPlugins, type SubNavItem } from '../plugins';
import { ProjectInterfacePage } from './project/ProjectInterfacePage';
import { ProjectActivityPage } from './project/ProjectActivityPage';
import { ProjectDataPage } from './project/ProjectDataPage';
import { ProjectMembersPage } from './project/ProjectMembersPage';
import { ProjectSettingPage } from './project/ProjectSettingPage';
import './ProjectPage.scss';

const BUILT_IN_NAV_KEYS = new Set(['interface', 'activity', 'data', 'members', 'setting']);

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
  const hideMembers = groupQuery.data?.data?.type === 'private';

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

  const navItems = useMemo<MenuProps['items']>(
    () =>
      Object.keys(subNavMap).map(key => ({
        key,
        label: subNavMap[key].name
      })),
    [subNavMap]
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
      <div className="legacy-page-loading">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <div className="m-subnav">
        <Menu
          mode="horizontal"
          selectedKeys={[activeKey]}
          className="g-row m-subnav-menu"
          items={Object.keys(subNavMap).map(key => {
            const item = subNavMap[key];
            let name = item.name;
            if (name.length === 2) {
              name = name[0] + ' ' + name[1];
            }
            return {
              key,
              className: 'item',
              label: <Link to={item.path}>{name}</Link>
            };
          })}
        />
      </div>

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
    </div>
  );
}
