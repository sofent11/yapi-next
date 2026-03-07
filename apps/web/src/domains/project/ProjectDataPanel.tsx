import type { ReactNode } from 'react';
import { SectionCard } from '../../components/layout';

type ProjectDataPanelProps = {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ProjectDataPanel(props: ProjectDataPanelProps) {
  return (
    <SectionCard
      title={props.title}
      extra={props.extra}
      className={['project-data-card', props.className].filter(Boolean).join(' ')}
    >
      {props.children}
    </SectionCard>
  );
}
