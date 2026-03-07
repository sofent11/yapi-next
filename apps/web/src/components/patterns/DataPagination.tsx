import { Button, Text } from '@mantine/core';

type DataPaginationProps = {
  page: number;
  totalPages: number;
  totalItems?: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
};

export function DataPagination(props: DataPaginationProps) {
  if (props.totalPages <= 1) {
    return null;
  }

  const summary = props.totalItems != null
    ? `第 ${props.page} / ${props.totalPages} 页，共 ${props.totalItems} 个${props.itemLabel || '项目'}`
    : `第 ${props.page} / ${props.totalPages} 页`;

  return (
    <div className="data-pagination">
      <Text size="sm" c="dimmed">
        {summary}
      </Text>
      <div className="data-pagination-actions">
        <Button
          variant="default"
          disabled={props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          上一页
        </Button>
        <Button
          variant="default"
          disabled={props.page >= props.totalPages}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
