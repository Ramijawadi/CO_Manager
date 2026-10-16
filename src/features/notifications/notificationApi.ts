import { apiRequest, jsonBody } from '../../lib/api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPage = { items: NotificationItem[]; total: number; totalPages: number };

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params: string) => ['notifications', 'list', params] as const,
  unread: ['notifications', 'unread-count'] as const,
};

export const fetchNotifications = (params: string) =>
  apiRequest<NotificationPage>(`notifications?${params}`);

export const markNotification = (id: string, action: 'read' | 'unread' | 'archive' | 'restore') =>
  apiRequest<NotificationItem>(`notifications/${id}/action`, {
    method: 'PATCH', body: jsonBody({ action }),
  });

export const notificationTimeAgo = (value: string) => dayjs(value).fromNow();

const notificationTypeLabels: Record<string, string> = {
  employee_approval: 'Demande de compte',
  account_status: 'État du compte',
  shift_admin_closed: 'Clôture de service',
  operational_request: 'Demande opérationnelle',
  request_update: 'Réponse administrative',
  admin_announcement: 'Information de l’administration',
};

export const notificationTypeLabel = (type: string) => notificationTypeLabels[type] || 'Notification';
