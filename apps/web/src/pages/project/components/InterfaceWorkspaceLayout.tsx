import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import { SplitWorkspace } from '../../../components/layout';

type InterfaceWorkspaceLayoutProps = {
  action: string;
  apiMenu: ReactNode;
  collectionMenu: ReactNode;
  apiContent: ReactNode;
  collectionContent: ReactNode;
  onSwitchAction: (next: 'api' | 'col') => void;
};

export function InterfaceWorkspaceLayout(props: InterfaceWorkspaceLayoutProps) {
  const activeKey = props.action === 'api' ? 'api' : 'col';

  return (
    <SplitWorkspace
      className="legacy-project-interface-layout"
      leftWidth={312}
      left={
        <div className="legacy-interface-side-pane">
          <Tabs
            type="card"
            className="legacy-interface-side-tabs"
            activeKey={activeKey}
            onChange={key => {
              if (key === 'api') {
                props.onSwitchAction('api');
              }
              if (key === 'col') {
                props.onSwitchAction('col');
              }
            }}
            items={[
              { key: 'api', label: '接口列表' },
              { key: 'col', label: '测试集合' }
            ]}
          />
          {props.action === 'api' ? props.apiMenu : props.collectionMenu}
        </div>
      }
      right={
        <div className="legacy-project-interface-content">
          <div className="legacy-interface-right-pane">
            <div className="legacy-interface-content-card">
              {props.action === 'api' ? props.apiContent : props.collectionContent}
            </div>
          </div>
        </div>
      }
    />
  );
}
