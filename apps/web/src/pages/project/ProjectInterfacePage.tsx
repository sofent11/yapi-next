import { AutoTestResultModals } from './components/AutoTestResultModals';
import { CollectionModals } from './components/CollectionModals';
import { InterfaceCoreModals } from './components/InterfaceCoreModals';
import { InterfaceWorkspaceLayout } from './components/InterfaceWorkspaceLayout';
import { InterfaceApiContent } from './components/InterfaceApiContent';
import { InterfaceCollectionContent } from './components/InterfaceCollectionContent';
import { ProjectInterfaceApiMenu } from './components/ProjectInterfaceApiMenu';
import { ProjectInterfaceCollectionMenu } from './components/ProjectInterfaceCollectionMenu';

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
    <>
      <InterfaceWorkspaceLayout
        action={action}
        apiMenu={<ProjectInterfaceApiMenu {...apiMenuProps} />}
        collectionMenu={<ProjectInterfaceCollectionMenu {...collectionMenuProps} />}
        apiContent={<InterfaceApiContent {...apiContentProps} />}
        collectionContent={<InterfaceCollectionContent {...collectionContentProps} />}
        onSwitchAction={next => navigateWithGuard(`/project/${props.projectId}/interface/${next}`)}
      />

      <InterfaceCoreModals {...coreModalsProps} />
      <CollectionModals {...collectionModalsProps} />
      <AutoTestResultModals {...autoTestModalsProps} />
    </>
  );
}
