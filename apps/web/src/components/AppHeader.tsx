import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Menu,
  Popover,
  Text,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Autocomplete } from '@mantine/core';
import {
  IconChevronDown,
  IconChartBar,
  IconCirclePlus,
  IconHelpCircle,
  IconLogout,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconUser,
  IconUsers,
  IconSettings
} from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLazySearchProjectQuery, useLogoutMutation } from '../services/yapi-api';
import { webPlugins, type HeaderMenuItem } from '../plugins';
import { AppBreadcrumb } from './AppBreadcrumb';
import { GuideActions } from './GuideActions';
import { useGuide } from '../context/GuideContext';
import LogoSVG from './LogoSVG';

type AppHeaderProps = {
  uid: number;
  username?: string;
  email?: string;
  role?: string;
  imageUrl?: string;
  study?: boolean;
};

const defaultHeaderMenu: Record<string, HeaderMenuItem> = {
  user: {
    path: '/user/profile/:uid',
    name: '个人中心',
    icon: 'user',
    adminFlag: false
  },
  solution: {
    path: '/user/list',
    name: '用户管理',
    icon: 'team',
    adminFlag: true
  }
};

function mapIcon(icon?: string) {
  switch (icon) {
    case 'user':
      return <IconUser size={16} />;
    case 'team':
    case 'solution':
      return <IconUsers size={16} />;
    case 'star':
    case 'star-o':
      return <IconStarFilled size={16} />;
    case 'logout':
      return <IconLogout size={16} />;
    case 'setting':
      return <IconSettings size={16} />;
    case 'bar-chart':
      return <IconChartBar size={16} />;
    default:
      return <IconUser size={16} />;
  }
}

export function AppHeader(props: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [keyword, setKeyword] = useState('');
  const [search, searchState] = useLazySearchProjectQuery();
  const [logout, logoutState] = useLogoutMutation();
  const guide = useGuide();

  const headerMenu = useMemo(() => {
    const next: Record<string, HeaderMenuItem> = { ...defaultHeaderMenu };
    webPlugins.applyHeaderMenu(next);
    return next;
  }, []);

  const dropdownItems = useMemo(() => {
    const rows: Array<{ key: string; label: string; to?: string; icon?: ReactNode; onClick?: () => Promise<void> }> = [];
    Object.keys(headerMenu).forEach(key => {
      const item = headerMenu[key];
      if (item.adminFlag && props.role !== 'admin') return;
      let link = item.path.includes(':uid') ? item.path.replace(':uid', String(props.uid)) : item.path;
      if (item.path === '/user/profile') {
        link = `${item.path}/${props.uid}`;
      }
      rows.push({
        key,
        label: item.name,
        to: link,
        icon: mapIcon(item.icon)
      });
    });
    rows.push({
      key: 'logout',
      label: '退出',
      icon: <IconLogout size={16} />,
      onClick: async () => {
        const response = await logout().unwrap();
        if (response.errcode !== 0) {
          notifications.show({ color: 'red', message: response.errmsg || '退出失败' });
          return;
        }
        notifications.show({ color: 'teal', message: '退出成功' });
        navigate('/');
      }
    });
    return rows;
  }, [headerMenu, navigate, logout, props.role, props.uid]);

  const autoOptions = useMemo<Array<{ value: string; label: string }>>(() => {
    const data = searchState.data?.data as
      | {
        group?: Array<{ _id: number; groupName?: string }>;
        project?: Array<{ _id: number } & Record<string, unknown>>;
        interface?: Array<{ _id: number } & Record<string, unknown>>;
      }
      | undefined;
    const items: Array<{ value: string; label: string }> = [];

    data?.group?.forEach(item => {
      const groupId = Number((item as Record<string, unknown>)._id || (item as Record<string, unknown>).id || 0);
      if (groupId <= 0) return;
      const groupName =
        String((item as Record<string, unknown>).group_name || item.groupName || item._id);
      items.push({
        value: `g-${groupId}`,
        label: `分组: ${groupName}`
      });
    });
    data?.project?.forEach(item => {
      const projectId = Number(
        (item as Record<string, unknown>)._id ||
        (item as Record<string, unknown>).id ||
        (item as Record<string, unknown>).project_id ||
        0
      );
      if (projectId <= 0) return;
      const name = String((item as Record<string, unknown>).name || item._id);
      items.push({
        value: `p-${projectId}`,
        label: `项目: ${name}`
      });
    });
    data?.interface?.forEach(item => {
      const interfaceId = Number((item as Record<string, unknown>)._id || (item as Record<string, unknown>).id || 0);
      if (interfaceId <= 0) return;
      const title = String((item as Record<string, unknown>).title || item._id);
      const projectId = Number(
        (item as Record<string, unknown>).projectId ||
        (item as Record<string, unknown>).project_id ||
        (item as Record<string, unknown>).projectid ||
        0
      );
      if (projectId <= 0) return;
      items.push({
        value: `i-${projectId}-${interfaceId}`,
        label: `接口: ${title}`
      });
    });
    return items.slice(0, 12);
  }, [searchState.data]);

  async function handleSearch(value: string) {
    const q = value.trim();
    if (!q) return;
    await search({ q }).unwrap();
  }

  function handleSelect(value: string) {
    const [type, idOrPid, maybeInterfaceId] = value.split('-');
    if (type === 'g' && idOrPid) {
      navigate(`/group/${idOrPid}`);
      setKeyword('');
      return;
    }
    if (type === 'p' && idOrPid) {
      navigate(`/project/${idOrPid}`);
      setKeyword('');
      return;
    }
    if (type === 'i' && idOrPid && maybeInterfaceId) {
      navigate(`/project/${idOrPid}/interface/api/${maybeInterfaceId}`);
      setKeyword('');
    }
  }

  useEffect(() => {
    const q = keyword.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void handleSearch(q);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const avatarUrl = props.imageUrl || `/api/user/avatar?uid=${props.uid}`;
  const inFollow = location.pathname.startsWith('/follow');
  const inAddProject = location.pathname.startsWith('/add-project');
  const guideVisible = guide.active && !props.study;
  const tipFollow = (
    <div className="guide-tip-title">
      <h3><IconStar size={16} /> 关注</h3>
      <p>这里是你的专属收藏夹，便于你快速找到常用项目。</p>
    </div>
  );
  const tipAdd = (
    <div className="guide-tip-title">
      <h3><IconCirclePlus size={16} /> 新建项目</h3>
      <p>在任何页面都可以快速新建项目。</p>
    </div>
  );
  const tipDoc = (
    <div className="guide-tip-title">
      <h3>
        使用文档 <Badge color="orange">推荐</Badge>
      </h3>
      <p>初次使用建议先阅读文档，快速掌握项目、接口和 Mock 的完整流程。</p>
    </div>
  );

  return (
    <header className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white">
      <Link
        to="/group"
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-white text-slate-900 transition hover:border-blue-400 hover:bg-blue-400 hover:text-white"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full">
          <LogoSVG length={28} />
        </div>
      </Link>

      <AppBreadcrumb />

      <div className="flex items-center gap-3">
        <Autocomplete
          className="w-[230px] max-w-[32vw]"
          value={keyword}
          data={autoOptions}
          onChange={setKeyword}
          onOptionSubmit={handleSelect}
          leftSection={<IconSearch size={16} />}
          placeholder="搜索分组/项目/接口"
          aria-label="搜索分组、项目或接口"
          onKeyDown={event => {
            if (event.key === 'Enter') {
              void handleSearch(keyword);
            }
          }}
        />
        <Popover
          open={guideVisible && guide.step === 1}
          position="bottom-end"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <div>
              <Tooltip label="我的关注">
                <ActionIcon
                  component={Link}
                  to="/follow"
                  variant={inFollow ? 'light' : 'subtle'}
                  color={inFollow ? 'blue' : 'gray'}
                  radius="xl"
                  size="lg"
                  aria-label="进入我的关注"
                >
                  <IconStar size={18} />
                </ActionIcon>
              </Tooltip>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div className="space-y-3">
              {tipFollow}
              <GuideActions onNext={guide.next} onExit={guide.finish} />
            </div>
          </Popover.Dropdown>
        </Popover>
        <Popover open={guideVisible && guide.step === 2} position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <div>
              <Tooltip label="新建项目">
                <ActionIcon
                  component={Link}
                  to="/add-project"
                  variant={inAddProject ? 'light' : 'subtle'}
                  color={inAddProject ? 'blue' : 'gray'}
                  radius="xl"
                  size="lg"
                  aria-label="新建项目"
                >
                  <IconCirclePlus size={18} />
                </ActionIcon>
              </Tooltip>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div className="space-y-3">
              {tipAdd}
              <GuideActions onNext={guide.next} onExit={guide.finish} />
            </div>
          </Popover.Dropdown>
        </Popover>
        <Popover open={guideVisible && guide.step === 3} position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <div>
              <Tooltip label="使用文档">
                <ActionIcon
                  component="a"
                  href="https://hellosean1025.github.io/yapi/"
                  target="_blank"
                  rel="noreferrer"
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  size="lg"
                  aria-label="打开使用文档"
                >
                  <IconHelpCircle size={18} />
                </ActionIcon>
              </Tooltip>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div className="space-y-3">
              {tipDoc}
              <GuideActions isLast onNext={guide.next} onExit={guide.finish} />
            </div>
          </Popover.Dropdown>
        </Popover>

        <Menu width={220} position="bottom-end" shadow="md">
          <Menu.Target>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-white transition hover:border-slate-500"
              disabled={logoutState.isLoading}
              aria-label="打开用户菜单"
            >
              <Avatar src={avatarUrl} size={30} color="blue">
                {(props.username || props.email || 'U').slice(0, 1).toUpperCase()}
              </Avatar>
              <Text size="sm" className="max-w-24 truncate text-slate-100">
                {props.username || props.email || 'User'}
              </Text>
              <IconChevronDown size={16} className="text-slate-400" />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {dropdownItems.map(item =>
              item.key === 'logout' ? (
                <Fragment key={item.key}>
                  <Menu.Divider />
                  <Menu.Item leftSection={item.icon} onClick={() => void item.onClick?.()}>
                    {item.label}
                  </Menu.Item>
                </Fragment>
              ) : (
                <Menu.Item
                  key={item.key}
                  component={item.to ? Link : 'button'}
                  to={item.to}
                  leftSection={item.icon}
                >
                  {item.label}
                </Menu.Item>
              )
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
