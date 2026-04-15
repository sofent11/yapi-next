import { Badge, Button, ScrollArea, Text, TextInput } from '@mantine/core';
import { IconCirclePlus, IconSearch } from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';

type RequestRecord = WorkspaceIndex['requests'][number];

function methodTone(method: string) {
  switch (method) {
    case 'GET':
      return 'green';
    case 'POST':
      return 'blue';
    case 'DELETE':
      return 'red';
    case 'PATCH':
      return 'orange';
    default:
      return 'gray';
  }
}

export function InterfaceCatalogPanel(props: {
  categoryLabel: string;
  records: RequestRecord[];
  selectedRequestId: string | null;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelect: (requestId: string) => void;
  onCreateInterface: () => void;
}) {
  return (
    <section className="interface-catalog">
      <div className="interface-catalog-head">
        <div>
          <p className="eyebrow">Category</p>
          <h3>{props.categoryLabel}</h3>
        </div>
        <Button variant="light" color="dark" leftSection={<IconCirclePlus size={15} />} onClick={props.onCreateInterface}>
          New
        </Button>
      </div>

      <TextInput
        value={props.searchText}
        leftSection={<IconSearch size={15} />}
        placeholder="Search interface"
        onChange={event => props.onSearchChange(event.currentTarget.value)}
      />

      <ScrollArea className="interface-catalog-scroll">
        <div className="interface-catalog-list">
          {props.records.length > 0 ? (
            props.records.map(record => (
              <button
                key={record.request.id}
                className={['interface-row', record.request.id === props.selectedRequestId ? 'is-selected' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => props.onSelect(record.request.id)}
              >
                <div className="interface-row-head">
                  <Badge color={methodTone(record.request.method)} variant="light">
                    {record.request.method}
                  </Badge>
                  {record.cases.length > 0 ? <span className="interface-meta">{record.cases.length} cases</span> : null}
                </div>
                <strong>{record.request.name}</strong>
                <span className="interface-path">{record.request.path || record.request.url || '/'}</span>
              </button>
            ))
          ) : (
            <div className="interface-empty">
              <Text fw={700}>No interface in this category</Text>
              <Text c="dimmed" size="sm">
                Create one manually or import a spec into the project.
              </Text>
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
