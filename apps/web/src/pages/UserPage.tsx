import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { UserListPage } from './UserListPage';
import { UserProfilePage } from './UserProfilePage';

export function UserPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/user' || location.pathname === '/user/') {
      navigate('/user/list', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <Routes>
      <Route path="list" element={<UserListPage />} />
      <Route path="profile/:uid" element={<UserProfilePage />} />
      <Route path="profile" element={<UserProfilePage />} />
      <Route path="*" element={<Navigate to="/user/list" replace />} />
    </Routes>
  );
}
