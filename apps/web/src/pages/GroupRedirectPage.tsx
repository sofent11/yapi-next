import { Navigate } from 'react-router-dom';
import { Loader, Text } from '@mantine/core';
import { useGetGroupListQuery, useGetMyGroupQuery } from '../services/yapi-api';

export function GroupRedirectPage() {
  const myGroupQuery = useGetMyGroupQuery();
  const groupListQuery = useGetGroupListQuery();

  const myGroupId = Number(myGroupQuery.data?.data?._id || 0);
  const firstGroupId = Number((groupListQuery.data?.data || [])[0]?._id || 0);
  const targetGroupId = myGroupId > 0 ? myGroupId : firstGroupId;

  if ((myGroupQuery.isLoading || groupListQuery.isLoading) && targetGroupId <= 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (targetGroupId > 0) {
    return <Navigate to={`/group/${targetGroupId}`} replace />;
  }

  return (
    <div className="flex min-h-[260px] items-center justify-center">
      <Text c="dimmed">暂无可访问分组，请联系管理员分配权限。</Text>
    </div>
  );
}
