import { useAuthStore } from '../store/authStore';
import { message } from 'antd';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const usePermissions = (employeeOnly = false) => {
  const { role } = useAuthStore();
  const { t } = useTranslation();
  const isDemo = role === 'demo';
  const canWrite = employeeOnly ? role === 'employee' || role === 'staff' : !!role && !isDemo;
  const deniedMessage = employeeOnly
    ? t('Opération réservée aux employés.')
    : t('Available for administrators only.');
  const requireWrite = useCallback(() => {
    if (!canWrite) message.error(deniedMessage, 3);
    return canWrite;
  }, [canWrite, deniedMessage]);

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
    canWrite,
    isReadOnly: !canWrite,
    requireWrite,
    deniedMessage,
    isDemo,
    requireAdmin,
  };
};
