import { Button, ScrollArea, Text } from '@mantine/core';
import { IconArrowDown, IconFolderPlus, IconLayoutGridAdd, IconUpload } from '@tabler/icons-react';

export type CategoryItem = {
  key: string;
  label: string;
  count: number;
};

export function ProjectSidebarPanel(props: {
  projectName: string;
  requestCount: number;
  categories: CategoryItem[];
  selectedCategory: string;
  categoryDraft: string;
  creatingCategory: boolean;
  onSelectCategory: (key: string) => void;
  onToggleCreateCategory: () => void;
  onCategoryDraftChange: (value: string) => void;
  onConfirmCreateCategory: () => void;
  onCreateInterface: () => void;
  onOpenImport: () => void;
}) {
  return (
    <aside className="project-panel">
      <div className="project-card">
        <p className="eyebrow">Project</p>
        <h2>{props.projectName}</h2>
        <Text c="dimmed" size="sm">
          {props.requestCount} interfaces in this workspace. Categories keep imported specs and hand-written APIs in the same navigation model.
        </Text>
        <div className="project-actions">
          <Button color="dark" leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
            Import
          </Button>
          <Button variant="default" leftSection={<IconLayoutGridAdd size={16} />} onClick={props.onCreateInterface}>
            New Interface
          </Button>
        </div>
      </div>

      <div className="category-panel">
        <div className="category-panel-head">
          <div>
            <p className="eyebrow">Categories</p>
            <Text fw={700}>Project / Category / Interface</Text>
          </div>
          <Button variant="subtle" color="dark" leftSection={<IconFolderPlus size={14} />} onClick={props.onToggleCreateCategory}>
            New
          </Button>
        </div>

        {props.creatingCategory ? (
          <div className="category-draft-shell">
            <input
              className="category-draft-input"
              value={props.categoryDraft}
              placeholder="users"
              onChange={event => props.onCategoryDraftChange(event.currentTarget.value)}
            />
            <Button color="dark" onClick={props.onConfirmCreateCategory}>
              Confirm
            </Button>
          </div>
        ) : null}

        <ScrollArea className="category-scroll">
          <div className="category-list">
            {props.categories.map(item => (
              <button
                key={item.key}
                className={['category-row', item.key === props.selectedCategory ? 'is-selected' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => props.onSelectCategory(item.key)}
              >
                <span className="category-row-name">
                  <IconArrowDown size={14} />
                  {item.label}
                </span>
                <span className="category-row-count">{item.count}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
