import type { ReactNode } from 'react';
import { Card } from 'antd';

type SectionCardProps = {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard(props: SectionCardProps) {
  const className = ['legacy-section-card', props.className].filter(Boolean).join(' ');
  return (
    <Card title={props.title} extra={props.extra} className={className}>
      {props.children}
    </Card>
  );
}
