import { useState, type ReactNode } from 'react';
import { ActionIcon, Drawer, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';

type ConsoleShellProps = {
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  asideClassName?: string;
  contentClassName?: string;
};

export function ConsoleShell(props: ConsoleShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 1023px)');

  if (isMobile) {
    return (
      <div className={['flex flex-col gap-4', props.className].filter(Boolean).join(' ')}>
        <div className="flex items-center gap-2">
          <Tooltip label="展开侧栏">
            <ActionIcon
              variant="light"
              color="gray"
              radius="xl"
              size="lg"
              onClick={() => setDrawerOpen(true)}
              aria-label="展开侧栏"
            >
              <IconLayoutSidebarLeftExpand size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
        <Drawer
          opened={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={300}
          padding="md"
          title="分组导航"
          overlayProps={{ backgroundOpacity: 0.3, blur: 2 }}
        >
          {props.aside}
        </Drawer>
        <section className={['min-w-0 flex-1', props.contentClassName].filter(Boolean).join(' ')}>
          {props.children}
        </section>
      </div>
    );
  }

  return (
    <div className={['flex gap-4', props.className].filter(Boolean).join(' ')}>
      <aside
        className={[
          'flex-none transition-all duration-200 ease-in-out',
          collapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[260px] opacity-100',
          props.asideClassName
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {props.aside}
      </aside>
      <div className="flex flex-none flex-col items-center pt-2">
        <Tooltip label={collapsed ? '展开侧栏' : '折叠侧栏'}>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            size="sm"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand size={16} />
            ) : (
              <IconLayoutSidebarLeftCollapse size={16} />
            )}
          </ActionIcon>
        </Tooltip>
      </div>
      <section className={['min-w-0 flex-1', props.contentClassName].filter(Boolean).join(' ')}>
        {props.children}
      </section>
    </div>
  );
}
