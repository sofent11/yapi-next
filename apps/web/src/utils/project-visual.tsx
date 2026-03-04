import type { ReactNode } from 'react';
import {
  AndroidOutlined,
  ApiOutlined,
  AppleOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CodeOutlined,
  CoffeeOutlined,
  CustomerServiceOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  ForkOutlined,
  GlobalOutlined,
  HddOutlined,
  IdcardOutlined,
  LineChartOutlined,
  MailOutlined,
  MedicineBoxOutlined,
  MobileOutlined,
  NotificationOutlined,
  PayCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  RocketOutlined,
  SafetyOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShoppingCartOutlined,
  StarOutlined,
  SwapOutlined,
  TagOutlined,
  TeamOutlined,
  ToolOutlined,
  UnlockOutlined,
  VideoCameraOutlined,
  WifiOutlined
} from '@ant-design/icons';

export const PROJECT_COLOR_MAP: Record<string, string> = {
  blue: '#2395f1',
  green: '#00a854',
  yellow: '#ffbf00',
  red: '#f56a00',
  pink: '#f5317f',
  cyan: '#00a2ae',
  gray: '#bfbfbf',
  purple: '#7265e6'
};

export const PROJECT_COLOR_OPTIONS = [
  'blue',
  'green',
  'yellow',
  'red',
  'pink',
  'cyan',
  'gray',
  'purple'
] as const;

export const PROJECT_ICON_OPTIONS = [
  'code-o',
  'swap',
  'clock-circle-o',
  'unlock',
  'calendar',
  'play-circle-o',
  'file-text',
  'desktop',
  'hdd',
  'appstore-o',
  'line-chart',
  'mail',
  'mobile',
  'notification',
  'picture',
  'poweroff',
  'search',
  'setting',
  'share-alt',
  'shopping-cart',
  'tag-o',
  'video-camera',
  'cloud-o',
  'star-o',
  'environment-o',
  'camera-o',
  'team',
  'customer-service',
  'pay-circle-o',
  'rocket',
  'database',
  'tool',
  'wifi',
  'idcard',
  'medicine-box',
  'coffee',
  'safety',
  'global',
  'api',
  'fork',
  'android-o',
  'apple-o'
] as const;

const PROJECT_ICON_MAP: Record<string, ReactNode> = {
  'code-o': <CodeOutlined />,
  swap: <SwapOutlined />,
  'clock-circle-o': <ClockCircleOutlined />,
  unlock: <UnlockOutlined />,
  calendar: <CalendarOutlined />,
  'play-circle-o': <PlayCircleOutlined />,
  'file-text': <FileTextOutlined />,
  desktop: <DesktopOutlined />,
  hdd: <HddOutlined />,
  'appstore-o': <AppstoreOutlined />,
  'line-chart': <LineChartOutlined />,
  mail: <MailOutlined />,
  mobile: <MobileOutlined />,
  notification: <NotificationOutlined />,
  picture: <PictureOutlined />,
  poweroff: <PoweroffOutlined />,
  search: <SearchOutlined />,
  setting: <SettingOutlined />,
  'share-alt': <ShareAltOutlined />,
  'shopping-cart': <ShoppingCartOutlined />,
  'tag-o': <TagOutlined />,
  'video-camera': <VideoCameraOutlined />,
  'cloud-o': <CloudOutlined />,
  'star-o': <StarOutlined />,
  'environment-o': <EnvironmentOutlined />,
  'camera-o': <CameraOutlined />,
  team: <TeamOutlined />,
  'customer-service': <CustomerServiceOutlined />,
  'pay-circle-o': <PayCircleOutlined />,
  rocket: <RocketOutlined />,
  database: <DatabaseOutlined />,
  tool: <ToolOutlined />,
  wifi: <WifiOutlined />,
  idcard: <IdcardOutlined />,
  'medicine-box': <MedicineBoxOutlined />,
  coffee: <CoffeeOutlined />,
  safety: <SafetyOutlined />,
  global: <GlobalOutlined />,
  api: <ApiOutlined />,
  fork: <ForkOutlined />,
  'android-o': <AndroidOutlined />,
  'apple-o': <AppleOutlined />
};

export function resolveProjectColor(rawColor: string | undefined, seed = ''): string {
  if (rawColor && PROJECT_COLOR_MAP[rawColor]) {
    return PROJECT_COLOR_MAP[rawColor];
  }
  if (rawColor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor)) {
    return rawColor;
  }
  void seed;
  return PROJECT_COLOR_MAP.blue;
}

export function renderProjectIcon(icon: string | undefined): ReactNode {
  if (icon && PROJECT_ICON_MAP[icon]) {
    return PROJECT_ICON_MAP[icon];
  }
  return <StarOutlined />;
}

export function randomProjectColorKey(): string {
  const idx = Math.floor(Math.random() * PROJECT_COLOR_OPTIONS.length);
  return PROJECT_COLOR_OPTIONS[idx];
}

export function randomProjectIconKey(): string {
  const idx = Math.floor(Math.random() * PROJECT_ICON_OPTIONS.length);
  return PROJECT_ICON_OPTIONS[idx];
}
