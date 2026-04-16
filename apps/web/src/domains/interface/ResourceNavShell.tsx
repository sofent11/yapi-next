import type { MouseEvent, ReactNode } from 'react';
import { Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { FilterBar } from '../../components/layout';

type ResourceNavShellProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  actions?: ReactNode;
  summary: ReactNode;
  emptyState?: ReactNode;
  children: ReactNode;
  onListContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
};

export function ResourceNavShell(props: ResourceNavShellProps) {
  return (
    <div className="interface-nav">
      <div className="interface-nav-actions">
        <FilterBar
          className="interface-nav-filter"
          left={
            <TextInput
              value={props.searchValue}
              onChange={event => props.onSearchChange(event.currentTarget.value)}
              placeholder={props.searchPlaceholder}
              leftSection={<IconSearch size={16} />}
              className="interface-nav-filter-input"
              classNames={{
                input:
                  'dark:!border-[var(--border-project-subtle)] dark:!bg-[var(--surface-project-input)] dark:!text-slate-200 dark:placeholder:!text-slate-500',
                section: 'dark:!text-slate-400'
              }}
            />
          }
          right={props.actions}
        />
      </div>

      <div className="interface-nav-summary">
        <Text c="dimmed" size="sm">
          {props.summary}
        </Text>
      </div>

      <div
        className="interface-nav-list"
        onMouseDown={event => {
          if (event.button === 2 && props.onListContextMenu) {
            event.preventDefault();
          }
        }}
        onContextMenu={event => {
          if (!props.onListContextMenu) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest('.interface-nav-group, .interface-nav-item')) return;
          props.onListContextMenu(event);
        }}
      >
        {props.emptyState}
        {props.children}
      </div>
    </div>
  );
}
