import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Loader, Modal, Select, Text, Timeline } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { useGetInterfaceListQuery, useGetLogListQuery } from '../services/yapi-api';
import { buildLegacyLogDiff, type LegacyLogDiffItem } from '../utils/legacy-log-diff';
import { sanitizeHtml } from '../utils/html-sanitize';

type TimelineType = 'project' | 'group';

type LegacyTimelineProps = {
  type: TimelineType;
  typeid: number;
  projectIdForApiFilter?: number;
  showApiFilter?: boolean;
};

type LogRow = {
  _id?: number | string;
  uid?: number;
  username?: string;
  type?: string;
  typeid?: number;
  add_time?: number;
  content?: string;
  data?: unknown;
};

type ApiFilterOption = {
  label: string;
  value: string;
};

const API_FILTER_INTERFACE_LIMIT = 200;

function formatTime(sec?: number): string {
  if (!sec) return '-';
  return new Date(sec * 1000).toLocaleString();
}

function formatTimeAgo(sec?: number): string {
  const timestamp = Number(sec || 0);
  if (!timestamp) return '';
  const now = Math.floor(Date.now() / 1000);
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60);
  const hours = Math.floor(delta / 3600);
  const days = Math.floor(delta / 86400);
  const months = Math.floor(delta / (86400 * 30));
  const years = Math.floor(delta / (86400 * 30 * 12));

  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}月前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  if (delta >= 30) return `${delta}秒前`;
  return '刚刚';
}

function typeLabel(type?: string): string {
  if (type === 'project') return '项目';
  if (type === 'group') return '分组';
  if (type === 'interface') return '接口';
  if (type === 'interface_col') return '接口集';
  if (type === 'user') return '用户';
  return '其他';
}

function toNumericId(value: unknown): number {
  const id = Number(value || 0);
  if (!Number.isFinite(id) || id <= 0) return 0;
  return id;
}

export function LegacyTimeline(props: LegacyTimelineProps) {
  const [page, setPage] = useState(1);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [selectValue, setSelectValue] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [diffItems, setDiffItems] = useState<LegacyLogDiffItem[]>([]);

  const query = useGetLogListQuery(
    {
      type: props.type,
      typeid: props.typeid,
      page,
      limit: 10,
      selectValue
    },
    {
      skip: props.typeid <= 0
    }
  );
  const totalPages = Number(query.data?.data?.total || 0);
  const hasMore = page < totalPages;

  const interfaceQuery = useGetInterfaceListQuery(
    {
      projectId: Number(props.projectIdForApiFilter || props.typeid),
      page: 1,
      limit: API_FILTER_INTERFACE_LIMIT
    },
    {
      skip: !(props.showApiFilter && props.type === 'project' && props.typeid > 0)
    }
  );
  const interfaces = (interfaceQuery.data?.data?.list || []) as LegacyInterfaceDTO[];

  useEffect(() => {
    setPage(1);
    setLogRows([]);
  }, [props.type, props.typeid, selectValue]);

  useEffect(() => {
    const list = (query.data?.data?.list || []) as LogRow[];
    if (page <= 1) {
      setLogRows(list);
      return;
    }
    if (list.length === 0) return;
    setLogRows(prev => {
      const exists = new Set(prev.map(item => String(item._id || '')));
      const extra = list.filter(item => !exists.has(String(item._id || '')));
      return [...prev, ...extra];
    });
  }, [page, query.data]);

  const apiFilterOptions = useMemo<ApiFilterOption[]>(() => {
    const options: ApiFilterOption[] = [
      { label: '选择全部', value: '' },
      { label: 'wiki', value: 'wiki' }
    ];
    interfaces.forEach(item => {
      const id = toNumericId(item._id);
      if (id <= 0) return;
      const method = String(item.method || 'GET').toUpperCase();
      const title = String(item.title || item.path || id);
      const path = String(item.path || '');
      options.push({
        label: `${title} [${method}] ${path}`.trim(),
        value: String(id)
      });
    });
    return options;
  }, [interfaces]);

  return (
    <section className="legacy-timeline-wrap legacy-timeline-shell">
      {props.showApiFilter && props.type === 'project' ? (
        <div className="legacy-timeline-filter mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Text>选择查询的 Api：</Text>
            <Select
              value={selectValue}
              onChange={value => setSelectValue(value || '')}
              data={apiFilterOptions}
              searchable
              className="legacy-timeline-api-select min-w-[280px]"
            />
          </div>
        </div>
      ) : null}

      {logRows.length === 0 && !query.isFetching ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          暂无动态
        </div>
      ) : (
        <Timeline
          className="legacy-timeline-content"
          bulletSize={44}
          lineWidth={3}
          classNames={{
            item: 'legacy-timeline-row',
            itemBullet: 'legacy-timeline-bullet',
            itemBody: 'legacy-timeline-body',
            itemContent: 'legacy-timeline-item-content',
            itemTitle: 'legacy-timeline-item-title'
          }}
        >
          {logRows.map(item => {
            const rowType = String(item.type || props.type);
            const uid = toNumericId(item.uid);
            const interfaceDiff = !!item.data && typeof item.data === 'object';

            return (
              <Timeline.Item
                key={String(item._id || `${uid}-${item.add_time || 0}`)}
                bullet={
                  <Link to={`/user/profile/${uid}`}>
                    <Avatar src={`/api/user/avatar?uid=${uid}`} size={32} />
                  </Link>
                }
              >
                <div className="legacy-timeline-item space-y-3">
                  <div className="legacy-log-head flex flex-wrap items-center gap-3">
                    <span className="legacy-log-type legacy-log-chip">{typeLabel(rowType)}动态</span>
                    <span className="legacy-log-time">{formatTime(Number(item.add_time || 0))}</span>
                    <span className="legacy-logo-timeago">{formatTimeAgo(Number(item.add_time || 0))}</span>
                  </div>
                  <span
                    className="legacy-log-content block"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(item.content || '-')) }}
                  />
                  {interfaceDiff ? (
                    <div className="legacy-timeline-item-actions">
                      <Button
                        variant="default"
                        size="compact-sm"
                        onClick={() => {
                          setDiffItems(buildLegacyLogDiff(item.data));
                          setDetailOpen(true);
                        }}
                      >
                        改动详情
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}

      <div className="legacy-timeline-footer mt-4 flex justify-center">
        {query.isFetching ? (
          <Loader size="sm" />
        ) : hasMore ? (
          <Button variant="subtle" onClick={() => setPage(prev => prev + 1)}>
            查看更多
          </Button>
        ) : (
          <Text c="dimmed" size="sm">
            以上为全部内容
          </Text>
        )}
      </div>

      <Modal
        title="Api 改动日志"
        opened={detailOpen}
        onClose={() => setDetailOpen(false)}
        size="xl"
      >
        <div className="legacy-diff-note mb-4 text-sm text-slate-500">注：绿色代表新增内容，红色代表删除内容</div>
        <div className="legacy-diff-content space-y-4">
          {diffItems.length > 0 ? (
            diffItems.map(item => (
              <div key={item.title} className="legacy-diff-item space-y-2">
                <h3 className="legacy-diff-item-title text-base font-semibold text-slate-900">{item.title}</h3>
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }} />
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              没有改动
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
