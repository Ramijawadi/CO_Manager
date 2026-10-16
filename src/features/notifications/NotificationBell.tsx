import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Empty, List, message, Popover, Spin, Typography } from 'antd';
import { BellOutlined, CheckOutlined, NotificationOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest, jsonBody } from '../../lib/api';
import {
  fetchNotifications, markNotification, notificationKeys, type NotificationItem,
  notificationTimeAgo, notificationTypeLabel,
} from './notificationApi';
import './notifications.css';

type TicketResponse = { mode: 'socket' | 'polling'; ticket?: string; socketUrl?: string };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [realtimeMode, setRealtimeMode] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiRequest<{ count: number }>('notifications/unread-count'),
    refetchInterval: socketConnected ? false : 15000,
  });
  const previewParams = 'page=1&limit=6';
  const preview = useQuery({
    queryKey: notificationKeys.list(previewParams),
    queryFn: () => fetchNotifications(previewParams),
    refetchInterval: socketConnected ? false : 15000,
  });

  useEffect(() => {
    let disposed = false;
    let socket: ReturnType<typeof io> | undefined;
    let firstTicket: string | undefined;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };
    const initialize = async () => {
      try {
        const ticketResponse = await apiRequest<TicketResponse>('notifications/socket-ticket', {
          method: 'POST', body: '{}',
        });
        if (disposed) return;
        if (ticketResponse.mode !== 'socket' || !ticketResponse.ticket) {
          setRealtimeMode('polling');
          return;
        }
        firstTicket = ticketResponse.ticket;
        socket = io(ticketResponse.socketUrl || import.meta.env.VITE_SOCKET_URL || window.location.origin, {
          path: '/socket.io',
          auth: callback => {
            if (firstTicket) {
              const ticket = firstTicket;
              firstTicket = undefined;
              callback({ ticket });
              return;
            }
            void apiRequest<TicketResponse>('notifications/socket-ticket', {
              method: 'POST', body: '{}',
            }).then(result => {
              if (!disposed && result.mode === 'socket' && result.ticket) {
                callback({ ticket: result.ticket });
              } else {
                callback({});
                socket?.disconnect();
                setRealtimeMode('polling');
              }
            }).catch(error => {
              console.warn('Could not refresh the notification connection ticket.', error);
              setRealtimeMode('polling');
              callback({});
            });
          },
        });
        socket.on('connect', () => {
          setSocketConnected(true);
          setRealtimeMode('live');
          invalidate();
        });
        socket.on('disconnect', () => {
          setSocketConnected(false);
          if (!disposed) setRealtimeMode('connecting');
        });
        socket.on('connect_error', () => {
          setSocketConnected(false);
          setRealtimeMode('connecting');
        });
        socket.io.on('reconnect_attempt', () => setRealtimeMode('connecting'));
        socket.on('notification:new', invalidate);
        socket.on('notification:updated', invalidate);
      } catch (error) {
        if (!disposed) {
          console.warn('Live notifications are unavailable; using periodic refresh.', error);
          setRealtimeMode('polling');
          retryTimeout = setTimeout(() => { void initialize(); }, 15_000);
        }
      }
    };
    void initialize();
    return () => {
      disposed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      socket?.disconnect();
      setSocketConnected(false);
    };
  }, [queryClient]);

  const openNotification = async (item: NotificationItem) => {
    try {
      if (!item.read_at) {
        await markNotification(item.id, 'read');
        await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
      setOpen(false);
      if (item.action_url) navigate(item.action_url);
      else navigate('/notifications');
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('Action impossible'));
    }
  };

  const content = (
    <div className="notification-popover">
      <div className="notification-popover__header">
        <div>
          <Typography.Text strong>{t('Notifications')}</Typography.Text>
          <Typography.Text type="secondary" className="notification-popover__caption">
            {unread.data?.count ?? 0} {t('non lues')} · {t(
              realtimeMode === 'live' ? 'Mise à jour en direct'
                : realtimeMode === 'connecting' ? 'Reconnexion en cours' : 'Actualisation périodique',
            )}
          </Typography.Text>
        </div>
        <Button type="link" size="small" onClick={() => { setOpen(false); navigate('/notifications'); }}>
          {t('Tout voir')}
        </Button>
      </div>
      {preview.isLoading ? <div className="notification-popover__loading"><Spin size="small" /></div>
        : preview.isError ? (
          <Alert
            type="error"
            showIcon
            message={t('Impossible de charger les notifications')}
            description={preview.error instanceof Error ? preview.error.message : undefined}
          />
        )
        : preview.data?.items.length ? (
          <List
            className="notification-popover__list"
            dataSource={preview.data.items}
            renderItem={item => (
              <List.Item
                className={`notification-row${item.read_at ? '' : ' notification-row--unread'}`}
                onClick={() => { void openNotification(item); }}
              >
                <span className="notification-row__icon"><NotificationOutlined /></span>
                <span className="notification-row__body">
                  <Typography.Text strong={!item.read_at} ellipsis>{item.title}</Typography.Text>
                  <Typography.Text type="secondary" className="notification-row__time">
                    {t(notificationTypeLabel(item.type))}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="notification-row__message">
                    {item.message}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="notification-row__time">
                    {notificationTimeAgo(item.created_at)}
                  </Typography.Text>
                </span>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune notification')} />
        )}
      <div className="notification-popover__footer">
        <Button
          type="text"
          size="small"
          icon={<CheckOutlined />}
          disabled={!unread.data?.count}
          onClick={() => {
            void apiRequest('notifications/read-all', { method: 'POST', body: jsonBody({}) })
              .then(() => queryClient.invalidateQueries({ queryKey: notificationKeys.all }))
              .catch(error => message.error(error instanceof Error ? error.message : t('Action impossible')));
          }}
        >
          {t('Tout marquer comme lu')}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      overlayClassName="notification-popover-overlay"
    >
      <Button
        aria-label={t(unread.isError ? 'Notifications indisponibles' : 'Notifications')}
        aria-expanded={open}
        className="notification-bell"
        shape="circle"
        icon={<Badge
          count={unread.data?.count ?? 0}
          dot={unread.isError && unread.data === undefined}
          size="small"
          overflowCount={99}
        ><BellOutlined /></Badge>}
      />
    </Popover>
  );
}
