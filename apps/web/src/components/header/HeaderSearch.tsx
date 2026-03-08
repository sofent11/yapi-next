import { useEffect, useMemo, useState } from 'react';
import { Autocomplete } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useLazySearchProjectQuery } from '../../services/yapi-api';

export function HeaderSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [search, searchState] = useLazySearchProjectQuery();

  const autoOptions = useMemo<Array<{ value: string; label: string }>>(() => {
    const data = searchState.data?.data as
      | {
          group?: Array<{ _id: number; groupName?: string }>;
          project?: Array<{ _id: number } & Record<string, unknown>>;
          interface?: Array<{ _id: number } & Record<string, unknown>>;
        }
      | undefined;
    const items: Array<{ value: string; label: string }> = [];

    data?.group?.forEach(item => {
      const groupId = Number((item as Record<string, unknown>)._id || (item as Record<string, unknown>).id || 0);
      if (groupId <= 0) return;
      const groupName =
        String((item as Record<string, unknown>).group_name || item.groupName || item._id);
      items.push({
        value: `g-${groupId}`,
        label: `分组: ${groupName}`
      });
    });
    data?.project?.forEach(item => {
      const projectId = Number(
        (item as Record<string, unknown>)._id ||
        (item as Record<string, unknown>).id ||
        (item as Record<string, unknown>).project_id ||
        0
      );
      if (projectId <= 0) return;
      const name = String((item as Record<string, unknown>).name || item._id);
      items.push({
        value: `p-${projectId}`,
        label: `项目: ${name}`
      });
    });
    data?.interface?.forEach(item => {
      const interfaceId = Number((item as Record<string, unknown>)._id || (item as Record<string, unknown>).id || 0);
      if (interfaceId <= 0) return;
      const title = String((item as Record<string, unknown>).title || item._id);
      const projectId = Number(
        (item as Record<string, unknown>).projectId ||
        (item as Record<string, unknown>).project_id ||
        (item as Record<string, unknown>).projectid ||
        0
      );
      if (projectId <= 0) return;
      items.push({
        value: `i-${projectId}-${interfaceId}`,
        label: `接口: ${title}`
      });
    });
    return items.slice(0, 12);
  }, [searchState.data]);

  async function handleSearch(value: string) {
    const q = value.trim();
    if (!q) return;
    await search({ q }).unwrap();
  }

  function handleSelect(value: string) {
    const [type, idOrPid, maybeInterfaceId] = value.split('-');
    if (type === 'g' && idOrPid) {
      navigate(`/group/${idOrPid}`);
      setKeyword('');
      return;
    }
    if (type === 'p' && idOrPid) {
      navigate(`/project/${idOrPid}`);
      setKeyword('');
      return;
    }
    if (type === 'i' && idOrPid && maybeInterfaceId) {
      navigate(`/project/${idOrPid}/interface/api/${maybeInterfaceId}`);
      setKeyword('');
    }
  }

  useEffect(() => {
    const q = keyword.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void handleSearch(q);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  return (
    <Autocomplete
      className="header-search w-[230px] max-w-[32vw]"
      value={keyword}
      data={autoOptions}
      onChange={setKeyword}
      onOptionSubmit={handleSelect}
      leftSection={<IconSearch size={16} />}
      placeholder="搜索分组/项目/接口"
      aria-label="搜索分组、项目或接口"
      onKeyDown={event => {
        if (event.key === 'Enter') {
          void handleSearch(keyword);
        }
      }}
    />
  );
}
