import { useMemo, useState, type ReactNode } from 'react';
import { ActionIcon, Drawer, SegmentedControl, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconListDetails,
  IconFolders
} from '@tabler/icons-react';

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
          <SegmentedControl
            fullWidth
            value={activeKey}
            classNames={{
              root: 'dark:!bg-[#0d2345]',
              control: 'dark:!border-transparent',
              indicator: 'dark:!border-[#3a6aa0] dark:!bg-[#13325d]',
              label: 'dark:!text-slate-300',
              innerLabel: 'dark:!text-inherit'
            }}
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
    [activeKey, props]
  );

  if (isMobile) {
    return (
      <>
        <div className="interface-workspace-layout flex flex-col">
          <div className="flex items-center gap-2 py-2">
            <Tooltip label="展开目录">
              <ActionIcon
                variant="light"
                color="gray"
                radius="xl"
                size="lg"
                onClick={() => setMobileOpen(true)}
                aria-label="展开目录"
              >
                <IconLayoutSidebarLeftExpand size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
          <div className="interface-workspace-content">
            <div className="interface-workspace-main">
              <div className="interface-workspace-card">
                {props.action === 'api' ? props.apiContent : props.collectionContent}
              </div>
            </div>
          </div>
        </div>
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
      </>
    );
  }

  return (
    <div className="interface-workspace-layout flex gap-0">
      {!leftHidden ? (
        <aside
          className="flex-none transition-all duration-200 ease-in-out w-[336px] opacity-100"
        >
          {sidePanel}
        </aside>
      ) : null}
      <div className="flex flex-none flex-col items-center pt-2">
        <Tooltip label={leftHidden ? '展开目录' : '收起目录'}>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            size="sm"
            onClick={() => setLeftHidden(v => !v)}
            aria-label={leftHidden ? '展开目录' : '收起目录'}
          >
            {leftHidden ? (
              <IconLayoutSidebarLeftExpand size={16} />
            ) : (
              <IconLayoutSidebarLeftCollapse size={16} />
            )}
          </ActionIcon>
        </Tooltip>
      </div>
      <section className="min-w-0 flex-1">
        <div className="interface-workspace-content">
          <div className="interface-workspace-main">
            <div className="interface-workspace-card">
              {props.action === 'api' ? props.apiContent : props.collectionContent}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
