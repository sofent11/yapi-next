import React from 'react';
import { CollectionMenuPanel } from './CollectionMenuPanel';
import type { CollectionRow } from './collection-types';

export type ProjectInterfaceCollectionMenuProps = {
  colKeyword: string;
  canEdit: boolean;
  colDisplayRows: CollectionRow[];
  selectedColId: number;
  action: string;
  caseId: string;
  expandedColIds: number[];
  colDragEnabled: boolean;
  setColKeyword: (keyword: string) => void;
  openColModal: (type: 'add' | 'edit', col?: { _id?: number; name?: string; desc?: string }) => void;
  toggleExpandedCol: (colId: number) => void;
  navigateWithGuard: (path: string) => void;
  projectId: number;
  handleCollectionDragStartCol: (colId: number) => void;
  handleCollectionDragStartCase: (colId: number, nextCaseId: string) => void;
  handleCollectionDragEnd: () => void;
  handleDropOnCol: (colId: number) => void;
  handleDropOnCase: (colId: number, id: string) => void;
  confirmDeleteCol: (colId: number) => void;
  openImportInterfaceModal: (colId: number) => void;
  handleCopyCol: (col: { _id?: number; name?: string; desc?: string }) => void;
  confirmDeleteCase: (caseItemId: string) => void;
  handleCopyCase: (caseItemId: string) => void;
};

export function ProjectInterfaceCollectionMenu(props: ProjectInterfaceCollectionMenuProps) {
  return (
    <CollectionMenuPanel
      colKeyword={props.colKeyword}
      canEdit={props.canEdit}
      colDisplayRows={props.colDisplayRows}
      selectedColId={props.selectedColId}
      action={props.action}
      caseId={props.caseId}
      expandedColIds={props.expandedColIds}
      colDragEnabled={props.colDragEnabled}
      onColKeywordChange={props.setColKeyword}
      onOpenAddCol={() => props.openColModal('add')}
      onToggleExpandCol={props.toggleExpandedCol}
      onNavigateCol={colId => props.navigateWithGuard(`/project/${props.projectId}/interface/col/${colId}`)}
      onNavigateCase={id => props.navigateWithGuard(`/project/${props.projectId}/interface/case/${id}`)}
      onDragStartCol={props.handleCollectionDragStartCol}
      onDragStartCase={props.handleCollectionDragStartCase}
      onDragEnd={props.handleCollectionDragEnd}
      onDropCol={colId => void props.handleDropOnCol(colId)}
      onDropCase={(colId, id) => void props.handleDropOnCase(colId, id)}
      onDeleteCol={props.confirmDeleteCol}
      onEditCol={col => props.openColModal('edit', col as { _id?: number; name?: string; desc?: string })}
      onImportCol={props.openImportInterfaceModal}
      onCopyCol={col => void props.handleCopyCol(col as { _id?: number; name?: string; desc?: string })}
      onDeleteCase={props.confirmDeleteCase}
      onCopyCase={id => void props.handleCopyCase(id)}
    />
  );
}
