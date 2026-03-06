import { useMemo, useState, type ReactNode } from 'react';
import { Button, Drawer, SegmentedControl } from '@mantine/core';
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
      <div className="interface-workspace-pane">
        <div className="interface-workspace-switch">
          {!isMobile ? (
            <div className="interface-workspace-switch-actions">
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={
                  leftHidden ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />
                }
                onClick={() => setLeftHidden(value => !value)}
                aria-label={leftHidden ? '展开资源目录' : '收起资源目录'}
              >
                {leftHidden ? '展开目录' : '收起目录'}
              </Button>
            </div>
          ) : null}
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
        <div className="interface-workspace-body">
          {props.action === 'api' ? props.apiMenu : props.collectionMenu}
        </div>
      </div>
    ),
    [activeKey, isMobile, leftHidden, props]
  );

  return (
    <>
      <SplitWorkspace
        className="interface-workspace-layout"
        leftWidth={336}
        leftHidden={!isMobile && leftHidden}
        left={isMobile ? <div /> : sidePanel}
        right={
          <div className="interface-workspace-content">
            <div className="interface-workspace-main">
              {isMobile || leftHidden ? (
                <div className="interface-workspace-actions">
                  <Button
                    variant="default"
                    leftSection={<IconLayoutSidebarLeftExpand size={16} />}
                    onClick={() => {
                      if (isMobile) {
                        setMobileOpen(true);
                        return;
                      }
                      setLeftHidden(false);
                    }}
                  >
                    {isMobile ? '打开目录' : '显示目录'}
                  </Button>
                </div>
              ) : null}
              <div className="interface-workspace-card">
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
          className="interface-workspace-drawer"
        >
          {sidePanel}
        </Drawer>
      ) : null}
    </>
  );
}
