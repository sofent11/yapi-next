import React from 'react';
import type { FormInstance } from 'rc-field-form';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../../types/interface-dto';
import { InterfaceMenuPanel } from './InterfaceMenuPanel';
import { getHttpMethodBadgeClassName } from '../../../utils/http-method';
import type { MenuDragItem } from '../ProjectInterfacePage.types';

export type ProjectInterfaceApiMenuProps = {
  menuKeyword: string;
  canEdit: boolean;
  hasCategories: boolean;
  menuDisplayRows: InterfaceTreeNode[];
  governanceRows: InterfaceTreeNode[];
  catId: number;
  interfaceId: number;
  expandedCatIds: number[];
  menuDragEnabled: boolean;
  catLoadingMap: Record<number, boolean>;
  setMenuKeyword: (keyword: string) => void;
  navigateWithGuard: (path: string) => void;
  projectId: number;
  openAddInterfaceModal: (catid?: number) => void;
  addCatForm: FormInstance<any>;
  setAddCatOpen: (open: boolean) => void;
  handleDropOnCat: (catIdNum: number) => void;
  setExpandedCatIds: React.Dispatch<React.SetStateAction<number[]>>;
  loadCatInterfaces: (catid: number) => void;
  setDraggingMenuItem: (item: MenuDragItem | null) => void;
  handleDropOnInterface: (catIdNum: number, ifaceId: number) => void;
  openEditCatModal: (cat: InterfaceTreeNode) => void;
  confirmDeleteCat: (cat: InterfaceTreeNode) => void;
  openRenameInterfaceModal: (item: Pick<InterfaceDTO, '_id' | 'title'>) => void;
  openAddCaseModalForInterface: (item: Pick<InterfaceDTO, '_id' | 'title'>) => void;
  copyInterfaceRow: (item: InterfaceDTO) => void;
  confirmDeleteInterface: (id: number) => void;
  deleteInterfacesDirect: (ids: number[]) => Promise<number[]>;
  deleteInterfaceCatsDirect: (catIds: number[]) => Promise<number[]>;
};

export function ProjectInterfaceApiMenu(props: ProjectInterfaceApiMenuProps) {
  return (
    <InterfaceMenuPanel
      menuKeyword={props.menuKeyword}
      canEdit={props.canEdit}
      hasCategories={props.hasCategories}
      menuDisplayRows={props.menuDisplayRows}
      governanceRows={props.governanceRows}
      catId={props.catId}
      interfaceId={props.interfaceId}
      expandedCatIds={props.expandedCatIds}
      menuDragEnabled={props.menuDragEnabled}
      catLoadingMap={props.catLoadingMap}
      onMenuKeywordChange={props.setMenuKeyword}
      onNavigateAll={() => props.navigateWithGuard(`/project/${props.projectId}/interface/api`)}
      onOpenAddInterface={() => props.openAddInterfaceModal()}
      onOpenAddCat={() => {
        props.addCatForm.resetFields();
        props.setAddCatOpen(true);
      }}
      onDropCat={catIdNum => void props.handleDropOnCat(catIdNum)}
      onToggleExpandCat={catIdNum =>
        props.setExpandedCatIds(prev => {
          if (prev.includes(catIdNum)) {
            return prev.filter(item => item !== catIdNum);
          }
          return [...prev, catIdNum];
        })
      }
      onEnsureCatLoaded={catIdNum => void props.loadCatInterfaces(catIdNum)}
      onNavigateCat={catIdNum => props.navigateWithGuard(`/project/${props.projectId}/interface/api/cat_${catIdNum}`)}
      onDragStartCat={catIdNum => props.setDraggingMenuItem({ type: 'cat', id: catIdNum })}
      onDragStartInterface={(catIdNum, ifaceId) =>
        props.setDraggingMenuItem({ type: 'interface', id: ifaceId, catid: catIdNum })
      }
      onDragEnd={() => props.setDraggingMenuItem(null)}
      onDropInterface={(catIdNum, ifaceId) => void props.handleDropOnInterface(catIdNum, ifaceId)}
      onOpenAddInterfaceInCat={props.openAddInterfaceModal}
      onEditCat={props.openEditCatModal}
      onDeleteCat={props.confirmDeleteCat}
      onRenameInterface={item => props.openRenameInterfaceModal(item)}
      onOpenAddCaseForInterface={item => props.openAddCaseModalForInterface(item)}
      onNavigateInterface={ifaceId => props.navigateWithGuard(`/project/${props.projectId}/interface/api/${ifaceId}`)}
      onCopyInterface={item => void props.copyInterfaceRow(item)}
      onDeleteInterface={props.confirmDeleteInterface}
      onDeleteInterfacesDirect={props.deleteInterfacesDirect}
      onDeleteInterfaceCatsDirect={props.deleteInterfaceCatsDirect}
      methodClassName={getHttpMethodBadgeClassName}
    />
  );
}
