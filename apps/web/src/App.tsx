import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import { matchPath, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Button, Center, Loader, Stack, Title } from '@mantine/core';
import { useGetUserStatusQuery } from './services/yapi-api';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { AppNotify } from './components/AppNotify';
import { GuideProvider } from './context/GuideContext';
import { webPlugins } from './plugins';
import type { AppRouteContract } from './types/route-contract';

const pageShellClassName = 'min-h-screen bg-slate-50 text-slate-900 flex flex-col';
const contentClassName = 'flex-1 px-6 py-6';
const skipLinkClassName =
  'sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow';
const browserHintClassName = 'mb-4';

function createLazyRouteComponent(
  loader: () => Promise<{ default: ComponentType<any> }>
): ComponentType<any> {
  const LazyComponent = lazy(loader);
  return function RouteComponentWrapper(props: Record<string, unknown>) {
    return <LazyComponent {...props} />;
  };
}

const HomePage = createLazyRouteComponent(() =>
  import('./pages/HomePage').then(mod => ({ default: mod.HomePage }))
);
const LoginPage = createLazyRouteComponent(() =>
  import('./pages/LoginPage').then(mod => ({ default: mod.LoginPage }))
);
const ProjectConsolePage = createLazyRouteComponent(() =>
  import('./pages/ProjectConsolePage').then(mod => ({ default: mod.ProjectConsolePage }))
);
const GroupRedirectPage = createLazyRouteComponent(() =>
  import('./pages/GroupRedirectPage').then(mod => ({ default: mod.GroupRedirectPage }))
);
const ProjectPage = createLazyRouteComponent(() =>
  import('./pages/ProjectPage').then(mod => ({ default: mod.ProjectPage }))
);
const UserPage = createLazyRouteComponent(() =>
  import('./pages/UserPage').then(mod => ({ default: mod.UserPage }))
);
const FollowPage = createLazyRouteComponent(() =>
  import('./pages/FollowPage').then(mod => ({ default: mod.FollowPage }))
);
const AddProjectPage = createLazyRouteComponent(() =>
  import('./pages/AddProjectPage').then(mod => ({ default: mod.AddProjectPage }))
);

function shouldShowBrowserHint(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = String(window.navigator.userAgent || '');
  const vendor = String(window.navigator.vendor || '');
  const hasChrome = /\bChrome\b/i.test(ua) || /\bCriOS\b/i.test(ua);
  const isChromiumEdge = /\bEdg\//i.test(ua);
  const isOpera = /\bOPR\//i.test(ua);
  const isSamsung = /\bSamsungBrowser\//i.test(ua);
  const isChromium = hasChrome || isChromiumEdge || isOpera || isSamsung;
  if (isChromium) return false;
  if (/Google Inc\./i.test(vendor)) return false;
  return true;
}

function LoadingView() {
  return (
    <Center className="min-h-[240px]">
      <Loader size="lg" />
    </Center>
  );
}

function StatusErrorView(props: { onRetry: () => void }) {
  return (
    <Center className="min-h-[260px]">
      <Stack align="center" gap="xs">
        <Title order={4}>登录状态检查失败</Title>
        <p className="text-sm text-slate-600">网络或服务暂时不可用，请重试。</p>
        <Button onClick={props.onRetry}>重试</Button>
      </Stack>
    </Center>
  );
}

function BrowserHint({ message }: { message: string }) {
  return (
    <Alert color="yellow" title="浏览器提示" className={browserHintClassName}>
      {message}
    </Alert>
  );
}

function SkipLink() {
  return (
    <a href="#app-main-content" className={skipLinkClassName}>
      跳转到主内容
    </a>
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  return (
    <main id="app-main-content" role="main" tabIndex={-1} className={contentClassName}>
      {children}
    </main>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return <div className={pageShellClassName}>{children}</div>;
}

function renderBrowserHint(show: boolean) {
  if (!show) return null;
  return (
    <BrowserHint message="YApi 的接口测试等功能仅支持 Chrome 浏览器，请使用 Chrome 浏览器获得完整功能。" />
  );
}

function isValidRouteContract(route: AppRouteContract | undefined): route is AppRouteContract {
  if (!route) return false;
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) return false;
  if (typeof route.component !== 'function') return false;
  if (route.protected !== undefined && typeof route.protected !== 'boolean') return false;
  return true;
}

function sanitizeRoutes(routes: Record<string, AppRouteContract>): Record<string, AppRouteContract> {
  const safeRoutes: Record<string, AppRouteContract> = {};
  Object.keys(routes).forEach(key => {
    const route = routes[key];
    if (!isValidRouteContract(route)) {
      // eslint-disable-next-line no-console
      console.error(`[route] invalid route dropped: ${key}`);
      return;
    }
    safeRoutes[key] = route;
  });
  return safeRoutes;
}

function renderRoutes(
  routes: Record<string, AppRouteContract>,
  mode: 'public' | 'protected' | 'all'
) {
  return Object.keys(routes).map(key => {
    const item = routes[key];
    if (item.path === '/' || item.path === '/login') return null;
    if (mode === 'public' && item.protected !== false) return null;
    if (mode === 'protected' && item.protected === false) return null;
    const C = item.component;
    return <Route key={`${key}-${item.path}`} path={item.path} element={<C />} />;
  });
}

function isPublicPath(pathname: string, routes: Record<string, AppRouteContract>): boolean {
  if (pathname === '/' || pathname === '/login') return true;
  const publicRoutes = Object.values(routes).filter(
    route => route.protected === false && route.path !== '/' && route.path !== '/login'
  );
  return publicRoutes.some(route => !!matchPath({ path: route.path, end: false }, pathname));
}

export function App() {
  const location = useLocation();
  const statusQuery = useGetUserStatusQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true
  });
  const user = statusQuery.data?.data;
  const isLoggedIn = statusQuery.data?.errcode === 0 && !!user;
  const isStatusLoading = statusQuery.isLoading && !statusQuery.data;
  const isStatusError = statusQuery.isError;

  const appRoutes = useMemo<Record<string, AppRouteContract>>(() => {
    const routes: Record<string, AppRouteContract> = {
      home: { path: '/', component: HomePage, protected: false },
      group: { path: '/group', component: GroupRedirectPage, protected: true },
      groupDetail: { path: '/group/:groupId', component: ProjectConsolePage, protected: true },
      project: { path: '/project/:id/*', component: ProjectPage, protected: true },
      user: { path: '/user/*', component: UserPage, protected: true },
      follow: { path: '/follow', component: FollowPage, protected: true },
      addProject: { path: '/add-project', component: AddProjectPage, protected: true },
      login: { path: '/login', component: LoginPage, protected: false }
    };
    webPlugins.applyAppRoutes(routes);
    return sanitizeRoutes(routes);
  }, []);

  const redirectToLogin = `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const browserHint = useMemo(() => shouldShowBrowserHint(), []);
  const needsAuth = useMemo(() => !isPublicPath(location.pathname, appRoutes), [appRoutes, location.pathname]);

  if (needsAuth && isStatusLoading) {
    return <LoadingView />;
  }

  if (needsAuth && !isLoggedIn && isStatusError) {
    return <StatusErrorView onRetry={() => void statusQuery.refetch()} />;
  }

  if (!isLoggedIn) {
    return (
      <AppShell>
        <SkipLink />
        {renderBrowserHint(browserHint)}
        <Suspense fallback={<LoadingView />}>
          <AppContent>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              {renderRoutes(appRoutes, 'public')}
              <Route path="*" element={<Navigate to={redirectToLogin} replace />} />
            </Routes>
          </AppContent>
        </Suspense>
      </AppShell>
    );
  }

  return (
    <GuideProvider
      uid={Number(user?._id || user?.uid || 0)}
      study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
    >
      <AppShell>
        <SkipLink />
        <AppHeader
          uid={Number(user?._id || user?.uid || 0)}
          username={user?.username}
          email={user?.email}
          role={user?.role}
          study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
        />
        <AppNotify enabled={String(user?.role || '') === 'admin'} />
        {renderBrowserHint(browserHint)}
        <Suspense fallback={<LoadingView />}>
          <AppContent>
            <Routes>
              <Route path="/" element={<Navigate to="/group" replace />} />
              <Route path="/login" element={<Navigate to="/group" replace />} />
              {renderRoutes(appRoutes, 'all')}
              <Route path="*" element={<Navigate to="/group" replace />} />
            </Routes>
          </AppContent>
        </Suspense>
        <AppFooter />
      </AppShell>
    </GuideProvider>
  );
}
