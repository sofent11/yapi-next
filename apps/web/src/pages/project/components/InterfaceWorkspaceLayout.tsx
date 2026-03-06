import { useMemo, useState, type ReactNode } from 'react';
import { Button, Drawer, SegmentedControl, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconListDetails,
  IconFolders
} from '@tabler/icons-react';
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
  const isMobile = !useMediaQuery('(min-width: 75em)');
  const [leftHidden, setLeftHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidePanel = useMemo(
    () => (
      <div className="legacy-interface-side-pane">
        <div className="legacy-interface-side-header">
          <div className="legacy-interface-side-header-copy">
            <Text className="legacy-interface-side-kicker">资源目录</Text>
            <Text className="legacy-interface-side-title">
              {activeKey === 'api' ? '接口资源树' : '测试集合'}
            </Text>
          </div>
          {!isMobile ? (
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={
                leftHidden ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />
              }
              onClick={() => setLeftHidden(value => !value)}
              aria-label={leftHidden ? '展开资源目录' : '收起资源目录'}
            >
              {leftHidden ? '展开' : '收起'}
            </Button>
          ) : null}
        </div>
        <div className="legacy-interface-side-switch">
          <SegmentedControl
            fullWidth
            value={activeKey}
            onChange={value => {
              if (value === 'api') props.onSwitchAction('api');
              if (value === 'col') props.onSwitchAction('col');
            }}
            data={[
              {
                value: 'api',
                label: <span className="inline-flex items-center gap-1"><IconListDetails size={14} />接口</span>
              },
              {
                value: 'col',
                label: <span className="inline-flex items-center gap-1"><IconFolders size={14} />集合</span>
              }
            ]}
          />
        </div>
        <div className="legacy-interface-side-body">
          {props.action === 'api' ? props.apiMenu : props.collectionMenu}
        </div>
      </div>
    ),
    [activeKey, isMobile, leftHidden, props]
  );

  return (
    <>
      <SplitWorkspace
        className="legacy-project-interface-layout"
        leftWidth={336}
        leftHidden={!isMobile && leftHidden}
        left={isMobile ? <div /> : sidePanel}
        right={
          <div className="legacy-project-interface-content">
            <div className="legacy-interface-right-pane">
              <div className="legacy-interface-workbench-toolbar">
                <div className="legacy-interface-workbench-copy">
                  <Text className="legacy-interface-workbench-kicker">工作区</Text>
                  <Text className="legacy-interface-workbench-title">
                    {activeKey === 'api' ? '接口详情与调试' : '测试集合与用例执行'}
                  </Text>
                </div>
                <div className="legacy-interface-workbench-actions">
                  {isMobile ? (
                    <Button
                      variant="default"
                      leftSection={<IconLayoutSidebarLeftExpand size={16} />}
                      onClick={() => setMobileOpen(true)}
                    >
                      打开目录
                    </Button>
                  ) : leftHidden ? (
                    <Button
                      variant="default"
                      leftSection={<IconLayoutSidebarLeftExpand size={16} />}
                      onClick={() => setLeftHidden(false)}
                    >
                      显示目录
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="legacy-interface-content-card">
                {props.action === 'api' ? props.apiContent : props.collectionContent}
              </div>
            </div>
          </div>
        }
      />

      {isMobile ? (
        <Drawer
          title="资源目录"
          position="left"
          size="min(88vw, 360px)"
          opened={mobileOpen}
          onClose={() => setMobileOpen(false)}
          className="legacy-interface-side-drawer"
        >
          {sidePanel}
        </Drawer>
      ) : null}
    </>
  );
}
