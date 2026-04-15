import { IconApi, IconClockBolt, IconFolderCog, IconLayoutGrid, IconSettings, IconStack3 } from '@tabler/icons-react';

const RAIL_ITEMS = [
  { key: 'interfaces', label: '接口管理', icon: IconApi, active: true },
  { key: 'projects', label: '项目视图', icon: IconLayoutGrid },
  { key: 'history', label: '请求历史', icon: IconClockBolt },
  { key: 'imports', label: '导入记录', icon: IconStack3 },
  { key: 'workspace', label: '工作区', icon: IconFolderCog },
  { key: 'settings', label: '设置', icon: IconSettings }
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
