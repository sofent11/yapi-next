import { IconApi, IconClockBolt, IconDeviceDesktopAnalytics, IconSettings, IconShare2, IconUsers } from '@tabler/icons-react';

const RAIL_ITEMS = [
  { key: 'interfaces', label: '接口管理', icon: IconApi, active: true },
  { key: 'tests', label: '自动化测试', icon: IconDeviceDesktopAnalytics },
  { key: 'share', label: '在线分享', icon: IconShare2 },
  { key: 'history', label: '请求历史', icon: IconClockBolt },
  { key: 'settings', label: '项目设置', icon: IconSettings },
  { key: 'members', label: '邀请成员', icon: IconUsers }
];

export function AppRail() {
  return (
    <aside className="app-rail">
      <div className="app-rail-brand">狐</div>
      <div className="app-rail-items">
        {RAIL_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={['app-rail-item', item.active ? 'is-active' : ''].filter(Boolean).join(' ')}
              type="button"
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
