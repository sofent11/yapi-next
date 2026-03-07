import type { ComponentProps } from 'react';
import { AutoTestResultModals } from '../../pages/project/components/AutoTestResultModals';
import { CollectionModals } from '../../pages/project/components/CollectionModals';
import { InterfaceApiContent, type InterfaceApiContentProps } from '../../pages/project/components/InterfaceApiContent';
import {
  InterfaceCollectionContent,
  type InterfaceCollectionContentProps
} from '../../pages/project/components/InterfaceCollectionContent';
import { InterfaceCoreModals } from '../../pages/project/components/InterfaceCoreModals';
import { InterfaceWorkspaceLayout } from '../../pages/project/components/InterfaceWorkspaceLayout';
import {
  ProjectInterfaceApiMenu,
  type ProjectInterfaceApiMenuProps
} from '../../pages/project/components/ProjectInterfaceApiMenu';
import {
  ProjectInterfaceCollectionMenu,
  type ProjectInterfaceCollectionMenuProps
} from '../../pages/project/components/ProjectInterfaceCollectionMenu';

type InterfaceWorkspacePageProps = {
  projectId: number;
  action: string;
  apiMenuProps: ProjectInterfaceApiMenuProps;
  collectionMenuProps: ProjectInterfaceCollectionMenuProps;
  apiContentProps: InterfaceApiContentProps;
  collectionContentProps: InterfaceCollectionContentProps;
  coreModalsProps: ComponentProps<typeof InterfaceCoreModals>;
  collectionModalsProps: ComponentProps<typeof CollectionModals>;
  autoTestModalsProps: ComponentProps<typeof AutoTestResultModals>;
  navigateWithGuard: (path: string) => void;
};

export function InterfaceWorkspacePage(props: InterfaceWorkspacePageProps) {
  return (
    <>
      <InterfaceWorkspaceLayout
        action={props.action}
        apiMenu={<ProjectInterfaceApiMenu {...props.apiMenuProps} />}
        collectionMenu={<ProjectInterfaceCollectionMenu {...props.collectionMenuProps} />}
        apiContent={<InterfaceApiContent {...props.apiContentProps} />}
        collectionContent={<InterfaceCollectionContent {...props.collectionContentProps} />}
        onSwitchAction={next => props.navigateWithGuard(`/project/${props.projectId}/interface/${next}`)}
      />
      <InterfaceCoreModals {...props.coreModalsProps} />
      <CollectionModals {...props.collectionModalsProps} />
      <AutoTestResultModals {...props.autoTestModalsProps} />
    </>
  );
}
