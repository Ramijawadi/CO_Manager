import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const useRoleGuard = (allowedRoles: string[]) => {
  const { role, session } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // We only enforce the guard if the user is authenticated and the role is loaded
    if (session && role && !allowedRoles.includes(role)) {
      navigate('/');
    }
  }, [role, allowedRoles, navigate, session]);
};
