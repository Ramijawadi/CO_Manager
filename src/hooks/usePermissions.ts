import { useAuthStore } from '../store/authStore';
import { message } from 'antd';
import { useCallback } from 'react';

export const usePermissions = () => {
  const { role } = useAuthStore();
  const isDemo = role === 'demo';

  const requireAdmin = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent | Event | any) => {
      if (isDemo) {
        if (e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        message.error('This feature is available for administrators only.', 3);
        return false;
      }
      return true;
    },
    [isDemo]
  );

  return {
    canWrite: !isDemo,
    isDemo,
    requireAdmin,
  };
};
