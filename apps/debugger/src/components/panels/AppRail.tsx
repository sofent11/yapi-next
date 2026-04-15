import { IconApi, IconFolderCog, IconPlugConnected, IconPointFilled } from '@tabler/icons-react';

export function AppRail(props: {
  workspaceName: string;
  requestCount: number;
  activeEnvironment: string;
  isDirty: boolean;
}) {
  return (
    <aside className="app-rail" aria-label="Workspace status rail">
      <div className="app-rail-brand" title={props.workspaceName}>
        <span>YA</span>
      </div>

      <div className="app-rail-metrics">
        <div className="app-rail-metric">
          <IconFolderCog size={17} />
          <span className="app-rail-metric-label">项目</span>
          <strong className="app-rail-metric-value">{props.workspaceName.slice(0, 2).toUpperCase()}</strong>
        </div>

        <div className="app-rail-metric">
          <IconApi size={17} />
          <span className="app-rail-metric-label">接口</span>
          <strong className="app-rail-metric-value">{props.requestCount}</strong>
        </div>

        <div className="app-rail-metric">
          <IconPlugConnected size={17} />
          <span className="app-rail-metric-label">环境</span>
          <strong className="app-rail-metric-value">{props.activeEnvironment.slice(0, 3).toUpperCase()}</strong>
        </div>
      </div>

      <div className="app-rail-shortcuts">
        <div className="app-rail-shortcut">
          <span>Open</span>
          <strong>Cmd+O</strong>
        </div>
        <div className="app-rail-shortcut">
          <span>Save</span>
          <strong>Cmd+S</strong>
        </div>
        <div className={['app-rail-shortcut', props.isDirty ? 'is-dirty' : ''].filter(Boolean).join(' ')}>
          <IconPointFilled size={10} />
          <strong>{props.isDirty ? 'Dirty' : 'Ready'}</strong>
        </div>
      </div>
    </aside>
  );
}
