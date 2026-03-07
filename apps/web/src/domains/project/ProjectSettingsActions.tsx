import type { ReactNode } from 'react';

type ProjectSettingsActionsProps = {
  children: ReactNode;
  className?: string;
};

export function ProjectSettingsActions(props: ProjectSettingsActionsProps) {
  return <div className={['project-settings-actions', props.className].filter(Boolean).join(' ')}>{props.children}</div>;
}
