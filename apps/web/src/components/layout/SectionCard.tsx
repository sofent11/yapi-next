import type { ReactNode } from 'react';
import { Card } from '@mantine/core';

type SectionCardProps = {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard(props: SectionCardProps) {
  return (
    <Card
      radius="xl"
      withBorder
      padding="lg"
      className={[
        'rounded-[var(--radius-xl)] border border-slate-200 bg-white/94 shadow-sm backdrop-blur dark:!border-[#24456f] dark:!bg-[#0d2345]',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.title || props.extra ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {props.title ? <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{props.title}</div> : <div />}
          {props.extra ? <div>{props.extra}</div> : null}
        </div>
      ) : null}
      {props.children}
    </Card>
  );
}
