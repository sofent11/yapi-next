import { InterfaceWorkspacePage } from '../../domains/interface/InterfaceWorkspacePage';
import type { ProjectInterfacePageProps } from './ProjectInterfacePage.types';
import { useProjectInterfaceLogic } from './ProjectInterfacePage.hooks';

export function ProjectInterfacePage(props: ProjectInterfacePageProps) {
  const logic = useProjectInterfaceLogic(props);

  const {
    action,
    apiMenuProps,
    collectionMenuProps,
    apiContentProps,
    collectionContentProps,
    coreModalsProps,
    collectionModalsProps,
    autoTestModalsProps,
    navigateWithGuard
  } = logic;

  return (
    <InterfaceWorkspacePage
      projectId={props.projectId}
      action={action}
      apiMenuProps={apiMenuProps}
      collectionMenuProps={collectionMenuProps}
      apiContentProps={apiContentProps}
      collectionContentProps={collectionContentProps}
      coreModalsProps={coreModalsProps}
      collectionModalsProps={collectionModalsProps}
      autoTestModalsProps={autoTestModalsProps}
      navigateWithGuard={navigateWithGuard}
    />
  );
}
