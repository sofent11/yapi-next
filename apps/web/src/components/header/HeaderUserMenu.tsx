import { Fragment, useMemo, type ReactNode } from 'react';
import {
  Avatar,
  Menu,
  Text
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChartBar,
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconSettings,
  IconStarFilled,
  IconSun,
  IconUser,
  IconUsers
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogoutMutation } from '../../services/yapi-api';
import { webPlugins, type HeaderMenuItem } from '../../plugins';
import { useTheme } from '../../hooks/useTheme';
import { apiPath } from '../../utils/base-path';

type HeaderUserMenuProps = {
  uid: number;
  username?: string;
  email?: string;
  role?: string;
  imageUrl?: string;
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

export function HeaderUserMenu(props: HeaderUserMenuProps) {
  const navigate = useNavigate();
  const [logout, logoutState] = useLogoutMutation();
  const { theme, toggleTheme } = useTheme();

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

  const avatarUrl = props.imageUrl || apiPath(`user/avatar?uid=${props.uid}`);

  return (
    <Menu width={220} position="bottom-end" shadow="md">
      <Menu.Target>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border-shell-subtle)] bg-[var(--surface-shell-subtle)] px-2.5 py-1.5 text-[var(--text-primary)] transition hover:border-[var(--border-shell-strong)] hover:bg-[var(--surface-shell-panel)]"
          disabled={logoutState.isLoading}
          aria-label="打开用户菜单"
        >
          <Avatar src={avatarUrl} size={30} color="blue">
            {(props.username || props.email || 'U').slice(0, 1).toUpperCase()}
          </Avatar>
          <Text size="sm" className="max-w-24 truncate text-[var(--text-primary)]">
            {props.username || props.email || 'User'}
          </Text>
          <IconChevronDown size={16} className="text-[var(--text-secondary)]" />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        {dropdownItems.map(item =>
          item.key === 'logout' ? (
            <Fragment key={item.key}>
              <Menu.Divider />
              <Menu.Item
                leftSection={theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? '浅色模式' : '深色模式'}
              </Menu.Item>
              <Menu.Item leftSection={item.icon} onClick={() => void item.onClick?.()}>
                {item.label}
              </Menu.Item>
            </Fragment>
          ) : (
            <Menu.Item key={item.key} component={Link} to={item.to || '/'} leftSection={item.icon}>
              {item.label}
            </Menu.Item>
          )
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
