import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Kbd,
  Modal,
  Text,
  TextInput,
  UnstyledButton
} from '@mantine/core';
import {
  IconApi,
  IconFolder,
  IconHistory,
  IconSearch,
  IconServer
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useLazySearchProjectQuery } from '../services/yapi-api';

/* ─── types ─── */

type ResultItem = {
  id: string;
  type: 'group' | 'project' | 'interface';
  label: string;
  path: string;
};

type RecentItem = {
  label: string;
  path: string;
  timestamp: number;
};

/* ─── recent items storage ─── */

const RECENT_KEY = 'yapi_cmd_recent';
const MAX_RECENT = 6;

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  const list = loadRecent().filter(r => r.path !== item.path);
  list.unshift(item);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

/* ─── icon helper ─── */

function typeIcon(type: string) {
  switch (type) {
    case 'group':
      return <IconFolder size={18} className="text-slate-400" />;
    case 'project':
      return <IconServer size={18} className="text-slate-400" />;
    case 'interface':
      return <IconApi size={18} className="text-slate-400" />;
    default:
      return <IconSearch size={18} className="text-slate-400" />;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case 'group':
      return '分组';
    case 'project':
      return '项目';
    case 'interface':
      return '接口';
    default:
      return '';
  }
}

/* ─── component ─── */

export function CommandPalette() {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentItems] = useState(loadRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, searchState] = useLazySearchProjectQuery();

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpened(prev => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = keyword.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void search({ q });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [keyword, search]);

  // Reset state on open/close
  useEffect(() => {
    if (opened) {
      setKeyword('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [opened]);

  // Parse search results into grouped items
  const results = useMemo<ResultItem[]>(() => {
    const data = searchState.data?.data as
      | {
          group?: Array<Record<string, unknown>>;
          project?: Array<Record<string, unknown>>;
          interface?: Array<Record<string, unknown>>;
        }
      | undefined;
    if (!data) return [];
    const items: ResultItem[] = [];

    data.group?.forEach(item => {
      const gid = Number(item._id || item.id || 0);
      if (gid <= 0) return;
      items.push({
        id: `g-${gid}`,
        type: 'group',
        label: String(item.group_name || item.groupName || gid),
        path: `/group/${gid}`
      });
    });
    data.project?.forEach(item => {
      const pid = Number(item._id || item.id || item.project_id || 0);
      if (pid <= 0) return;
      items.push({
        id: `p-${pid}`,
        type: 'project',
        label: String(item.name || pid),
        path: `/project/${pid}`
      });
    });
    data.interface?.forEach(item => {
      const iid = Number(item._id || item.id || 0);
      const pid = Number(item.projectId || item.project_id || item.projectid || 0);
      if (iid <= 0 || pid <= 0) return;
      items.push({
        id: `i-${pid}-${iid}`,
        type: 'interface',
        label: String(item.title || iid),
        path: `/project/${pid}/interface/api/${iid}`
      });
    });
    return items.slice(0, 15);
  }, [searchState.data]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const grouped: Record<string, ResultItem[]> = {};
    results.forEach(item => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });
    return grouped;
  }, [results]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const hasKeyword = keyword.trim().length >= 2;
    if (!hasKeyword) {
      return recentItems.map((r, i) => ({
        id: `recent-${i}`,
        label: r.label,
        path: r.path,
        type: 'recent' as const
      }));
    }
    return results;
  }, [keyword, results, recentItems]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length]);

  const handleSelect = useCallback(
    (path: string, label: string) => {
      saveRecent({ label, path, timestamp: Date.now() });
      navigate(path);
      setOpened(false);
    },
    [navigate]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % Math.max(1, flatItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + flatItems.length) % Math.max(1, flatItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) handleSelect(item.path, item.label);
    }
  }

  const hasKeyword = keyword.trim().length >= 2;
  const showRecent = !hasKeyword && recentItems.length > 0;
  const showResults = hasKeyword;
  const showEmpty = hasKeyword && results.length === 0 && !searchState.isFetching;

  let flatIndex = 0;

  return (
    <>
      {/* Trigger button in header */}
      <UnstyledButton
        onClick={() => setOpened(true)}
        className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
        aria-label="打开搜索面板 (⌘K)"
      >
        <IconSearch size={15} />
        <span className="hidden md:inline">搜索…</span>
        <Kbd size="xs" className="ml-1 hidden md:inline-flex">⌘K</Kbd>
      </UnstyledButton>

      {/* Modal */}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        withCloseButton={false}
        padding={0}
        radius="var(--radius-lg)"
        size={540}
        overlayProps={{ backgroundOpacity: 0.4, blur: 4 }}
        transitionProps={{ transition: 'pop', duration: 150 }}
        classNames={{ body: 'p-0' }}
      >
        <div className="flex flex-col">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <IconSearch size={20} className="flex-none text-slate-400" />
            <TextInput
              ref={inputRef}
              value={keyword}
              onChange={e => setKeyword(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索分组、项目或接口…"
              variant="unstyled"
              className="flex-1"
              classNames={{ input: 'text-base placeholder:text-slate-400' }}
              aria-label="搜索"
              autoFocus
            />
            <Kbd size="xs" className="flex-none">Esc</Kbd>
          </div>

          {/* Results area */}
          <div className="max-h-[360px] overflow-y-auto px-2 py-2">
            {/* Recent items */}
            {showRecent ? (
              <div>
                <Text size="xs" fw={600} c="dimmed" className="px-2 pb-1 pt-1 uppercase tracking-wider">
                  最近访问
                </Text>
                {recentItems.map((item, i) => {
                  const isCurrent = activeIndex === i;
                  return (
                    <UnstyledButton
                      key={item.path}
                      onClick={() => handleSelect(item.path, item.label)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
                        isCurrent ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <IconHistory size={16} className="flex-none text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </UnstyledButton>
                  );
                })}
              </div>
            ) : null}

            {/* Search results grouped */}
            {showResults ? (
              <>
                {searchState.isFetching ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">
                    搜索中…
                  </div>
                ) : null}

                {Object.entries(groupedResults).map(([type, items]) => (
                  <div key={type} className="mb-1">
                    <Text size="xs" fw={600} c="dimmed" className="px-2 pb-1 pt-2 uppercase tracking-wider">
                      {typeLabel(type)}
                    </Text>
                    {items.map(item => {
                      const currentFlatIndex = flatIndex++;
                      const isCurrent = activeIndex === currentFlatIndex;
                      return (
                        <UnstyledButton
                          key={item.id}
                          onClick={() => handleSelect(item.path, item.label)}
                          onMouseEnter={() => setActiveIndex(currentFlatIndex)}
                          className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
                            isCurrent ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {typeIcon(type)}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span className="flex-none text-xs text-slate-400">{typeLabel(type)}</span>
                        </UnstyledButton>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : null}

            {/* Empty state */}
            {showEmpty ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                未找到匹配的分组、项目或接口
              </div>
            ) : null}

            {/* Initial state */}
            {!showRecent && !showResults ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                输入关键词搜索分组、项目或接口
              </div>
            ) : null}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Kbd size="xs">↑</Kbd>
              <Kbd size="xs">↓</Kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="xs">↵</Kbd>
              跳转
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="xs">Esc</Kbd>
              关闭
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}
