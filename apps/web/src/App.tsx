import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import { matchPath, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Button, Layout, Result, Spin } from 'antd';
import { useGetUserStatusQuery } from './services/yapi-api';
import { LegacyHeader } from './components/LegacyHeader';
import { LegacyFooter } from './components/LegacyFooter';
import { LegacyNotify } from './components/LegacyNotify';
import { LegacyGuideProvider } from './context/LegacyGuideContext';
import { webPlugins } from './plugins';
import type { LegacyRouteContract } from './types/legacy-contract';
import './styles.css';

const { Content } = Layout;

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
    <div className="loading-shell">
      <Spin />
    </div>
  );
}

function StatusErrorView(props: { onRetry: () => void }) {
  return (
    <Result
      status="warning"
      title="登录状态检查失败"
      subTitle="网络或服务暂时不可用，请重试。"
      extra={
        <Button type="primary" onClick={props.onRetry}>
          重试
        </Button>
      }
    />
  );
}

function isValidRouteContract(route: LegacyRouteContract | undefined): route is LegacyRouteContract {
  if (!route) return false;
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) return false;
  if (typeof route.component !== 'function') return false;
  if (route.protected !== undefined && typeof route.protected !== 'boolean') return false;
  return true;
}

function sanitizeRoutes(routes: Record<string, LegacyRouteContract>): Record<string, LegacyRouteContract> {
  const safeRoutes: Record<string, LegacyRouteContract> = {};
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
  routes: Record<string, LegacyRouteContract>,
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

function isPublicPath(pathname: string, routes: Record<string, LegacyRouteContract>): boolean {
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

  const appRoutes = useMemo<Record<string, LegacyRouteContract>>(() => {
    const routes: Record<string, LegacyRouteContract> = {
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
      <>
        <a href="#app-main-content" className="legacy-skip-link">
          跳转到主内容
        </a>
        {browserHint ? (
          <Alert
            banner
            closable
            type="warning"
            message="YApi 的接口测试等功能仅支持 Chrome 浏览器，请使用 Chrome 浏览器获得完整功能。"
            className="legacy-browser-hint"
          />
        ) : null}
        <Suspense fallback={<LoadingView />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            {renderRoutes(appRoutes, 'public')}
            <Route path="*" element={<Navigate to={redirectToLogin} replace />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  return (
    <LegacyGuideProvider
      uid={Number(user?._id || user?.uid || 0)}
      study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
    >
      <Layout className="legacy-app-root">
        <a href="#app-main-content" className="legacy-skip-link">
          跳转到主内容
        </a>
        <LegacyHeader
          uid={Number(user?._id || user?.uid || 0)}
          username={user?.username}
          email={user?.email}
          role={user?.role}
          study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
        />
        <LegacyNotify enabled={String(user?.role || '') === 'admin'} />
        {browserHint ? (
          <Alert
            banner
            closable
            type="warning"
            message="YApi 的接口测试等功能仅支持 Chrome 浏览器，请使用 Chrome 浏览器获得完整功能。"
            className="legacy-browser-hint"
          />
        ) : null}
        <Content className="legacy-content-wrap" id="app-main-content" role="main" tabIndex={-1}>
          <Suspense fallback={<LoadingView />}>
            <Routes>
              <Route path="/" element={<Navigate to="/group" replace />} />
              <Route path="/login" element={<Navigate to="/group" replace />} />
              {renderRoutes(appRoutes, 'all')}
              <Route path="*" element={<Navigate to="/group" replace />} />
            </Routes>
          </Suspense>
        </Content>
        <LegacyFooter />
      </Layout>
    </LegacyGuideProvider>
  );
}
