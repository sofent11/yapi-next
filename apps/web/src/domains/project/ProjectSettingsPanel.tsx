import type { ReactNode } from 'react';
import { SectionCard } from '../../components/layout';

type ProjectSettingsPanelProps = {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ProjectSettingsPanel(props: ProjectSettingsPanelProps) {
  return (
    <SectionCard
      title={props.title}
      extra={props.extra}
      className={['m-panel project-settings-card', props.className].filter(Boolean).join(' ')}
    >
      {props.children}
    </SectionCard>
  );
}
