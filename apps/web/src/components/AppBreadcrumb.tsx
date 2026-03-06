import { Link, useLocation, useParams } from 'react-router-dom';
import { useGetGroupQuery, useGetProjectQuery } from '../services/yapi-api';

function usePathProjectId(): number {
  const location = useLocation();
  const match = location.pathname.match(/^\/project\/(\d+)/);
  if (!match) return 0;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : 0;
}

function usePathGroupId(): number {
  const params = useParams<{ groupId?: string }>();
  const id = Number(params.groupId || 0);
  return Number.isFinite(id) ? id : 0;
}

export function AppBreadcrumb() {
  const location = useLocation();
  const projectId = usePathProjectId();
  const groupId = usePathGroupId();

  const projectQuery = useGetProjectQuery({ projectId }, { skip: projectId <= 0 });
  const project = projectQuery.data?.data;
  const projectGroupId = Number(project?.group_id || 0);
  const groupQuery = useGetGroupQuery({ id: projectGroupId || groupId }, { skip: projectGroupId + groupId <= 0 });
  const group = groupQuery.data?.data;
  const groupName = group?.type === 'private' ? '个人空间' : group?.group_name || '项目分组';

  const crumbs: Array<{ label: string; to?: string }> = [];
  const path = location.pathname;

  if (path.startsWith('/group')) {
    crumbs.push({ label: groupName });
  } else if (path.startsWith('/project/')) {
    crumbs.push({
      label: groupName,
      to: projectGroupId > 0 ? `/group/${projectGroupId}` : '/group'
    });
    crumbs.push({ label: project?.name || `项目 ${projectId}` });
    if (path.includes('/interface/')) crumbs.push({ label: '接口' });
    if (path.includes('/activity')) crumbs.push({ label: '动态' });
    if (path.includes('/data')) crumbs.push({ label: '数据管理' });
    if (path.includes('/members')) crumbs.push({ label: '成员管理' });
    if (path.includes('/setting')) crumbs.push({ label: '设置' });
  } else if (path === '/add-project') {
    crumbs.push({ label: '新建项目' });
  } else if (path.startsWith('/follow')) {
    crumbs.push({ label: '我的关注' });
  } else if (path === '/user' || path.startsWith('/user/list')) {
    crumbs.push({ label: '用户管理' });
  } else if (path.startsWith('/user/profile')) {
    crumbs.push({ label: '用户管理', to: '/user/list' });
    crumbs.push({ label: '个人中心' });
  }

  if (crumbs.length === 0) return null;

  const groupMode = path.startsWith('/group');

  return (
    <div className={`min-w-0 flex-1 ${groupMode ? 'text-lg md:text-2xl' : 'text-sm'}`}>
      <div className="flex flex-wrap items-center gap-2 text-white/90">
        {crumbs.map((item, idx) => (
          <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-2">
            {idx > 0 ? <span className="text-white/45">/</span> : null}
            {item.to ? (
              <Link to={item.to} className="transition hover:text-white">
                {item.label}
              </Link>
            ) : (
              <span className={groupMode ? 'font-light tracking-wide' : 'text-white/80'}>{item.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
