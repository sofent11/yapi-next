import { useEffect, useMemo, useState } from 'react';
import {
  QuestionCircleOutlined,
  SearchOutlined,
  StarOutlined,
  PlusCircleOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  SettingOutlined,
  StarFilled,
  DownOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { AutoComplete, Avatar, Dropdown, Input, MenuProps, Popover, Tag, Tooltip, message } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLazySearchProjectQuery, useLogoutMutation } from '../services/yapi-api';
import { webPlugins, type HeaderMenuItem } from '../plugins';
import { LegacyBreadcrumb } from './LegacyBreadcrumb';
import { LegacyGuideActions } from './LegacyGuideActions';
import { useLegacyGuide } from '../context/LegacyGuideContext';
import LogoSVG from './LogoSVG';

type LegacyHeaderProps = {
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
      return <UserOutlined />;
    case 'team':
    case 'solution':
      return <TeamOutlined />;
    case 'star':
    case 'star-o':
      return <StarFilled />;
    case 'logout':
      return <LogoutOutlined />;
    case 'setting':
      return <SettingOutlined />;
    case 'bar-chart':
      return <BarChartOutlined />;
    default:
      return <UserOutlined />;
  }
}

export function LegacyHeader(props: LegacyHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [keyword, setKeyword] = useState('');
  const [search, searchState] = useLazySearchProjectQuery();
  const [logout, logoutState] = useLogoutMutation();
  const guide = useLegacyGuide();

  const headerMenu = useMemo(() => {
    const next: Record<string, HeaderMenuItem> = { ...defaultHeaderMenu };
    webPlugins.applyHeaderMenu(next);
    return next;
  }, []);

  const dropdownItems = useMemo<MenuProps['items']>(() => {
    const rows: MenuProps['items'] = [];
    Object.keys(headerMenu).forEach(key => {
      const item = headerMenu[key];
      if (item.adminFlag && props.role !== 'admin') return;
      let link = item.path.includes(':uid') ? item.path.replace(':uid', String(props.uid)) : item.path;
      if (item.path === '/user/profile') {
        link = `${item.path}/${props.uid}`;
      }
      rows.push({
        key,
        label: <Link to={link}>{item.name}</Link>,
        icon: mapIcon(item.icon)
      });
    });
    rows.push({
      type: 'divider'
    });
    rows.push({
      key: 'logout',
      label: '退出',
      icon: <LogoutOutlined />,
      onClick: async () => {
        const response = await logout().unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '退出失败');
          return;
        }
        message.success('退出成功');
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
    <div className="legacy-guide-tip-title">
      <h3><StarOutlined /> 关注</h3>
      <p>这里是你的专属收藏夹，便于你快速找到常用项目。</p>
    </div>
  );
  const tipAdd = (
    <div className="legacy-guide-tip-title">
      <h3><PlusCircleOutlined /> 新建项目</h3>
      <p>在任何页面都可以快速新建项目。</p>
    </div>
  );
  const tipDoc = (
    <div className="legacy-guide-tip-title">
      <h3>
        使用文档 <Tag color="orange">推荐</Tag>
      </h3>
      <p>初次使用建议先阅读文档，快速掌握项目、接口和 Mock 的完整流程。</p>
    </div>
  );

  return (
    <header className="legacy-header">
      <Link to="/group" className="legacy-logo-link">
        <div className="legacy-logo-dot">
          <LogoSVG length={28} />
        </div>
      </Link>

      <LegacyBreadcrumb />

      <div className="legacy-header-tools">
        <AutoComplete
          className="legacy-header-search"
          value={keyword}
          options={autoOptions}
          onChange={setKeyword}
          onSelect={handleSelect}
          defaultActiveFirstOption={false}
        >
          <Input
            onPressEnter={event => {
              void handleSearch(event.currentTarget.value);
            }}
            prefix={<SearchOutlined />}
            placeholder="搜索分组/项目/接口"
          />
        </AutoComplete>
        <Popover
          placement="bottomRight"
          open={guideVisible && guide.step === 1}
          title={tipFollow}
          content={<LegacyGuideActions onNext={guide.next} onExit={guide.finish} />}
          overlayClassName="legacy-guide-popover"
        >
          <Tooltip title="我的关注">
            <Link to="/follow" className={`legacy-icon-link${inFollow ? ' active' : ''}`}>
              <StarOutlined />
            </Link>
          </Tooltip>
        </Popover>
        <Popover
          placement="bottomRight"
          open={guideVisible && guide.step === 2}
          title={tipAdd}
          content={<LegacyGuideActions onNext={guide.next} onExit={guide.finish} />}
          overlayClassName="legacy-guide-popover"
        >
          <Tooltip title="新建项目">
            <Link to="/add-project" className={`legacy-icon-link${inAddProject ? ' active' : ''}`}>
              <PlusCircleOutlined />
            </Link>
          </Tooltip>
        </Popover>
        <Popover
          placement="bottomRight"
          open={guideVisible && guide.step === 3}
          title={tipDoc}
          content={<LegacyGuideActions isLast onNext={guide.next} onExit={guide.finish} />}
          overlayClassName="legacy-guide-popover"
        >
          <Tooltip title="使用文档">
            <a
              href="https://hellosean1025.github.io/yapi/"
              target="_blank"
              rel="noreferrer"
              className="legacy-icon-link"
            >
              <QuestionCircleOutlined />
            </a>
          </Tooltip>
        </Popover>

        <Dropdown
          menu={{ items: dropdownItems, className: 'legacy-user-menu' }}
          placement="bottomRight"
          trigger={['click']}
        >
          <button type="button" className="legacy-user-btn" disabled={logoutState.isLoading}>
            <Avatar src={avatarUrl} size={30} style={{ backgroundColor: '#1677ff', color: '#fff' }}>
              {(props.username || props.email || 'U').slice(0, 1).toUpperCase()}
            </Avatar>
            <DownOutlined />
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
