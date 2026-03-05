import type { ThemeConfig } from 'antd';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677FF',
    colorSuccess: '#0EA472',
    colorWarning: '#D97706',
    colorError: '#DC2626',
    colorInfo: '#1677FF',
    colorTextBase: '#142033',
    colorBgBase: '#F3F6FB',
    colorBorder: '#D9E2EE',
    borderRadius: 10,
    borderRadiusSM: 8,
    borderRadiusLG: 12,
    controlHeight: 36,
    controlHeightSM: 30,
    controlHeightLG: 42,
    fontFamily: 'Plus Jakarta Sans, Noto Sans SC, PingFang SC, Microsoft YaHei, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: 14,
    boxShadow:
      '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)',
    boxShadowSecondary:
      '0 2px 6px rgba(15, 23, 42, 0.05), 0 12px 36px rgba(15, 23, 42, 0.08)'
  },
  components: {
    Layout: {
      bodyBg: '#F3F6FB',
      headerBg: '#0F172A',
      headerColor: '#F8FAFC'
    },
    Card: {
      borderRadiusLG: 12,
      headerFontSize: 16
    },
    Button: {
      borderRadius: 10,
      controlHeight: 36,
      contentFontSize: 14,
      fontWeight: 600,
      primaryShadow: '0 8px 20px rgba(22, 119, 255, 0.25)'
    },
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 42,
      itemMarginInline: 4
    },
    Tabs: {
      cardBg: '#EEF2F8',
      cardHeight: 40,
      itemSelectedColor: '#1677FF',
      itemActiveColor: '#0F5DD8'
    },
    Input: {
      activeBorderColor: '#1677FF',
      hoverBorderColor: '#4A93FF'
    },
    Table: {
      borderColor: '#E2EAF4',
      headerBg: '#F7FAFF',
      rowHoverBg: '#EDF4FF'
    }
  }
};
