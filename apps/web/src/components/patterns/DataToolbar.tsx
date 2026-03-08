import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { FilterBar } from '../layout/FilterBar';

type DataToolbarProps = {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function DataToolbar(props: DataToolbarProps) {
  return (
    <FilterBar
      className={props.className}
      left={
        <div className="data-toolbar-copy space-y-1">
          <Text fw={700} className="tracking-tight">{props.title}</Text>
          {props.summary ? <Text size="sm" c="dimmed">{props.summary}</Text> : null}
        </div>
      }
      right={props.actions}
    />
  );
}
