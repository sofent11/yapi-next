import type { ReactNode } from 'react';
import { Alert } from '@mantine/core';

type ProjectDataIntroProps = {
  title: ReactNode;
  children?: ReactNode;
};

export function ProjectDataIntro(props: ProjectDataIntroProps) {
  return (
    <Alert color="blue" className="project-data-intro" title={props.title}>
      {props.children}
    </Alert>
  );
}
