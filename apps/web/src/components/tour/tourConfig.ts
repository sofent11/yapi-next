export type TourStep = {
  /** Unique key for the step */
  key: string;
  /** Title displayed in the popover */
  title: string;
  /** Description displayed in the popover */
  description?: string;
};

/**
 * Tour steps configuration for the app onboarding flow.
 * Each step corresponds to a TourPopover component placed in the UI.
 */
export const appTourSteps: TourStep[] = [
  {
    key: 'personal-space',
    title: '个人空间',
    description: '先从个人空间开始，你可以在这里管理自己的项目与接口。'
  },
  {
    key: 'follow',
    title: '我的关注',
    description: '这里是你的专属收藏夹，便于你快速找到常用项目。'
  },
  {
    key: 'add-project',
    title: '新建项目',
    description: '在任何页面都可以快速新建项目。'
  },
  {
    key: 'docs',
    title: '使用文档',
    description: '初次使用建议先阅读文档，快速掌握项目、接口和 Mock 的完整流程。'
  }
];
