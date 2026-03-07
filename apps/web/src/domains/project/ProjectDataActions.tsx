import type { ReactNode } from 'react';

type ProjectDataActionsProps = {
  children: ReactNode;
  className?: string;
};

export function ProjectDataActions(props: ProjectDataActionsProps) {
  return <div className={['project-data-actions', props.className].filter(Boolean).join(' ')}>{props.children}</div>;
}
