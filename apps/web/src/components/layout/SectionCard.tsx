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
        'rounded-[24px] border border-slate-200 bg-white/94 shadow-sm backdrop-blur',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.title || props.extra ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {props.title ? <div className="text-base font-semibold text-slate-900">{props.title}</div> : <div />}
          {props.extra ? <div>{props.extra}</div> : null}
        </div>
      ) : null}
      {props.children}
    </Card>
  );
}
