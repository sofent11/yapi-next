import type { ReactNode } from 'react';
import { Button, Tabs } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { ProjectConsoleModals } from './components/ProjectConsoleModals';
import { ProjectConsoleSettingTab } from './components/ProjectConsoleSettingTab';
import { ActivityList } from './project/components/ActivityList';
import { MemberList } from './project/components/MemberList';
import { ProjectList } from './project/components/ProjectList';
import { DocWorkspace } from '../components/docs/DocWorkspace';
import { AppShell, PageHeader } from '../components/layout';
import { ConsoleShell } from '../app/shells/ConsoleShell';
import { GroupNavigator } from '../domains/group-console/GroupNavigator';
import { isConsoleTabKey } from './ProjectConsolePage.utils';
import type { ConsoleTabKey } from './ProjectConsolePage.types';
import { useProjectConsoleState } from './hooks/useProjectConsoleState';

export function ProjectConsolePage() {
  const state = useProjectConsoleState();

  const personalSpaceTip = (
    <div className="guide-tip-title">
      <h3 className="flex items-center gap-2">
        <IconUser size={18} />
        个人空间
      </h3>
      <p>先从个人空间开始，你可以在这里管理自己的项目与接口。</p>
    </div>
  );

  const tabItems: Array<{ key: ConsoleTabKey; label: string; children: ReactNode }> = [
    {
      key: 'projects',
      label: '项目列表',
      children: (
        <ProjectList
          groupType={state.groupType}
          projectRows={state.projectRows}
          normalProjects={state.normalProjects}
          followedProjects={state.followedProjects}
          mixedPublicProjects={state.mixedPublicProjects}
          projectListFetching={state.projectListFetching}
          canCreateProject={state.canCreateProject}
          canCopyProject={state.canCopyProject}
          onAddProject={() => state.navigate('/add-project')}
          onNavigateProject={projectId => state.navigate(`/project/${projectId}`)}
          onToggleFollow={state.handleToggleFollow}
          onOpenCopyProject={state.onOpenCopyProject}
        />
      )
    }
  ];

  tabItems.push({
    key: 'docs',
    label: '文档',
    children: (
      <DocWorkspace
        title="分组文档"
        scope={{
          scope_type: 'group',
          group_id: state.groupId
        }}
      />
    )
  });

  if (state.showMembers) {
    tabItems.push({
      key: 'members',
      label: '成员列表',
      children: (
        <MemberList
          groupMemberCountTitle={state.groupMemberCountTitle}
          canManageGroupMembers={state.canManageGroupMembers}
          members={state.sortedMembers}
          loading={state.memberLoading}
          onOpenAddMember={state.openAddMemberModal}
          onChangeMemberRole={(uid, role) => state.handleChangeMemberRole(uid, role)}
          onDeleteMember={uid => state.handleDeleteMember(uid)}
        />
      )
    });
  }

  if (state.showActivity) {
    tabItems.push({
      key: 'activity',
      label: '分组动态',
      children: <ActivityList groupId={state.groupId} />
    });
  }

  if (state.showSetting) {
    tabItems.push({
      key: 'setting',
      label: '分组设置',
      children: (
        <ProjectConsoleSettingTab
          form={state.settingGroupForm}
          selectedGroupName={String(state.selectedGroup?.group_name || '')}
          customFieldRule={state.customFieldRule}
          updateLoading={state.updateLoading}
          canDeleteGroup={state.canDeleteGroup}
          showDangerOptions={state.showDangerOptions}
          dangerConfirmName={state.dangerConfirmName}
          dangerConfirmMatched={state.dangerConfirmName.trim() === String(state.selectedGroup?.group_name || '').trim()}
          deleteLoading={state.deleteLoading}
          onSave={state.onSaveSettings}
          onToggleDanger={state.onToggleDanger}
          onDangerConfirmNameChange={state.onDangerConfirmNameChange}
          onDeleteGroup={state.onDeleteGroup}
        />
      )
    });
  }

  return (
    <AppShell className="project-console-page">
      <PageHeader
        eyebrow="分组工作台"
        title="项目控制台"
        subtitle={state.selectedGroup?.group_desc || '查看项目、成员与分组动态。'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={state.openCreateGroupModal}>
              新建分组
            </Button>
            {state.canCreateProject ? (
              <Button onClick={() => state.navigate('/add-project')}>新建项目</Button>
            ) : null}
          </div>
        }
      />

      <div className="projectGround">
        <ConsoleShell
          className="project-console-layout"
          aside={
            <GroupNavigator
              guideVisible={state.guide.active}
              guideStep={state.guide.step}
              personalSpaceTip={personalSpaceTip}
              selectedGroupType={state.selectedGroup?.type}
              selectedGroupName={state.selectedGroup?.group_name}
              selectedGroupDesc={state.selectedGroup?.group_desc}
              groupKeyword={state.groupKeyword}
              onGroupKeywordChange={state.setGroupKeyword}
              loading={state.groupListLoading}
              groups={state.filteredGroups}
              selectedGroupId={state.groupId}
              onSelectGroup={state.handleSelectGroup}
              onOpenCreateGroup={state.openCreateGroupModal}
              onGuideNext={state.guide.next}
              onGuideExit={state.guide.finish}
            />
          }
        >
          <Tabs
            className="m-tab tabs-large project-console-tabs"
            value={state.activeTab}
            onChange={key => {
              if (key && isConsoleTabKey(key)) {
                const nextParams = new URLSearchParams(state.searchParams.toString());
                if (key === 'projects') {
                  nextParams.delete('tab');
                } else {
                  nextParams.set('tab', key);
                }
                state.setSearchParams(nextParams, { replace: true });
              }
            }}
          >
            <Tabs.List>
              {tabItems.map(item => (
                <Tabs.Tab key={item.key} value={item.key}>
                  {item.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {tabItems.map(item => (
              <Tabs.Panel key={item.key} value={item.key} pt="md">
                {item.children}
              </Tabs.Panel>
            ))}
          </Tabs>
        </ConsoleShell>
      </div>

      <ProjectConsoleModals
        createGroupOpen={state.createGroupOpen}
        createGroupLoading={state.createGroupLoading}
        createGroupForm={state.createGroupForm}
        ownerUserOptions={state.ownerUserOptions}
        onSearchOwnerUsers={state.onSearchOwnerUsers}
        onCancelCreateGroup={state.onCancelCreateGroup}
        onSubmitCreateGroup={state.onSubmitCreateGroup}
        copyModalOpen={state.copyModalOpen}
        copyModalLoading={state.copyModalLoading}
        copyProjectName={state.copyProjectTarget?.name}
        copyForm={state.copyForm}
        onCancelCopyModal={state.onCancelCopyModal}
        onSubmitCopy={state.onSubmitCopy}
        addMemberOpen={state.addMemberOpen}
        addMemberLoading={state.addMemberLoading}
        memberSelectedUids={state.memberSelectedUids}
        memberUserOptions={state.memberUserOptions}
        memberUidInput={state.memberUidInput}
        memberRoleInput={state.memberRoleInput}
        onSearchMemberUsers={state.onSearchMemberUsers}
        onMemberSelectedUidsChange={state.onMemberSelectedUidsChange}
        onMemberUidInputChange={state.onMemberUidInputChange}
        onMemberRoleInputChange={state.onMemberRoleInputChange}
        onCancelAddMember={state.onCancelAddMember}
        onSubmitAddMember={state.onSubmitAddMember}
      />
    </AppShell>
  );
}
