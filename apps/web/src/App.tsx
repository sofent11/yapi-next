import { useMemo } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import { useGetUserStatusQuery } from './services/yapi-api';
import { LegacyHeader } from './components/LegacyHeader';
import { LegacyFooter } from './components/LegacyFooter';
import { LegacyNotify } from './components/LegacyNotify';
import { LegacyGuideProvider } from './context/LegacyGuideContext';
import { webPlugins } from './plugins';
import type { LegacyRouteContract } from './types/legacy-contract';
import { registerDynamicReducers } from './store';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProjectConsolePage } from './pages/ProjectConsolePage';
import { GroupRedirectPage } from './pages/GroupRedirectPage';
import { ProjectPage } from './pages/ProjectPage';
import { UserPage } from './pages/UserPage';
import { FollowPage } from './pages/FollowPage';
import { AddProjectPage } from './pages/AddProjectPage';
import './styles.css';

const { Content } = Layout;

registerDynamicReducers(webPlugins.getDynamicReducers());

function LoadingView() {
  return (
    <div className="loading-shell">
      <Spin />
    </div>
  );
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

export function App() {
  const location = useLocation();
  const statusQuery = useGetUserStatusQuery();
  const user = statusQuery.data?.data;
  const isLoggedIn = statusQuery.data?.errcode === 0 && !!user;

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
    return routes;
  }, []);

  const redirectToLogin = `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  if (statusQuery.isLoading && !statusQuery.data) {
    return <LoadingView />;
  }

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        {renderRoutes(appRoutes, 'public')}
        <Route path="*" element={<Navigate to={redirectToLogin} replace />} />
      </Routes>
    );
  }

  return (
    <LegacyGuideProvider
      uid={Number(user?._id || user?.uid || 0)}
      study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
    >
      <Layout className="legacy-app-root">
        <LegacyHeader
          uid={Number(user?._id || user?.uid || 0)}
          username={user?.username}
          email={user?.email}
          role={user?.role}
          study={Boolean((user as unknown as Record<string, unknown> | null)?.study)}
        />
        <LegacyNotify enabled={String(user?.role || '') === 'admin'} />
        <Content className="legacy-content-wrap">
          <Routes>
            <Route path="/" element={<Navigate to="/group" replace />} />
            <Route path="/login" element={<Navigate to="/group" replace />} />
            {renderRoutes(appRoutes, 'all')}
            <Route path="*" element={<Navigate to="/group" replace />} />
          </Routes>
        </Content>
        <LegacyFooter />
      </Layout>
    </LegacyGuideProvider>
  );
}
