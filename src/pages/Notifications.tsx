import { useMemo, useState } from 'react';
import {
  Alert, Button, Card, Empty, Form, Input, List, Modal, Pagination, Select, Space,
  Spin, Tabs, Tag, Typography, message,
} from 'antd';
import {
  BellOutlined, CheckOutlined, CheckCircleOutlined, DeleteOutlined, SendOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest, jsonBody } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  fetchNotifications, markNotification, notificationKeys, notificationTimeAgo,
  notificationTypeLabel,
} from '../features/notifications/notificationApi';
import '../features/notifications/notifications.css';

type Employee = { id: string; full_name?: string; email: string; role: string; status?: string };
type EmployeePage = { items: Employee[] };
type AnnouncementValues = { recipient: string; title: string; message: string; priority: string };
type RequestValues = { type: string; title: string; message: string };
type EmployeeRequest = {
  id: string;
  title: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  admin_response: string | null;
  created_at: string;
};
type EmployeeRequestList = { items: EmployeeRequest[] };
type NotificationType =
  | 'employee_approval' | 'account_status' | 'shift_admin_closed'
  | 'operational_request' | 'request_update' | 'admin_announcement';

const notificationTabs = [
  { key: 'all', label: 'Toutes' },
  { key: 'unread', label: 'Non lues' },
  { key: 'read', label: 'Lues' },
];

export default function Notifications() {
  const { role } = useAuthStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [state, setState] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | undefined>();
  const [page, setPage] = useState(1);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [announcementForm] = Form.useForm<AnnouncementValues>();
  const [requestForm] = Form.useForm<RequestValues>();
  const [announcementKey, setAnnouncementKey] = useState(() => crypto.randomUUID());
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20', state });
    if (typeFilter) params.set('type', typeFilter);
    return params.toString();
  }, [page, state, typeFilter]);
  const notifications = useQuery({
    queryKey: notificationKeys.list(queryParams),
    queryFn: () => fetchNotifications(queryParams),
  });
  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiRequest<{ count: number }>('notifications/unread-count'),
  });
  const employeeRequests = useQuery({
    queryKey: ['employee-requests'],
    queryFn: () => apiRequest<EmployeeRequestList>('employee/requests'),
    enabled: role === 'employee' || role === 'staff',
  });
  const employees = useQuery({
    queryKey: ['admin-employees', 'notification-recipients'],
    queryFn: () => apiRequest<EmployeePage>('admin/employees?page=1&limit=100'),
    enabled: role === 'admin' && announcementOpen,
  });
  const activeEmployees = (employees.data?.items ?? []).filter(employee =>
    ['employee', 'staff'].includes(employee.role) && (!employee.status || employee.status === 'active'));

  const readMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'read' | 'unread' | 'archive' }) =>
      markNotification(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    onError: error => message.error(error instanceof Error ? error.message : t('Action impossible')),
  });
  const readAllMutation = useMutation({
    mutationFn: () => apiRequest('notifications/read-all', { method: 'POST', body: jsonBody({}) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      message.success(t('Toutes les notifications ont été marquées comme lues'));
    },
    onError: error => message.error(error instanceof Error ? error.message : t('Action impossible')),
  });
  const announcementMutation = useMutation({
    mutationFn: (values: AnnouncementValues) => apiRequest<{ sent: number }>('admin/notifications', {
      method: 'POST',
      body: jsonBody({
        ...(values.recipient === 'all' ? { audience: 'all_employees' } : { recipientId: values.recipient }),
        title: values.title,
        message: values.message,
        priority: values.priority,
        idempotencyKey: announcementKey,
      }),
    }),
    onSuccess: async result => {
      setAnnouncementOpen(false);
      announcementForm.resetFields();
      setAnnouncementKey(crypto.randomUUID());
      message.success(t('Notification envoyée à {{count}} employé(s)', { count: result.sent }));
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: error => message.error(error instanceof Error ? error.message : t('Envoi impossible')),
  });
  const requestMutation = useMutation({
    mutationFn: (values: RequestValues) => apiRequest('employee/requests', {
      method: 'POST', body: jsonBody({ ...values, idempotencyKey: requestKey }),
    }),
    onSuccess: async () => {
      setRequestOpen(false);
      requestForm.resetFields();
      setRequestKey(crypto.randomUUID());
      message.success(t('Votre demande a été envoyée'));
      await queryClient.invalidateQueries({ queryKey: ['employee-requests'] });
    },
    onError: error => message.error(error instanceof Error ? error.message : t('Envoi impossible')),
  });

  return (
    <main className="notifications-page">
      <div className="notifications-page__heading">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>{t('Notifications')}</Typography.Title>
          <Typography.Text type="secondary">
            {t('Retrouvez ici les informations importantes liées à votre activité.')}
          </Typography.Text>
        </div>
        <div className="notifications-page__actions">
          {role === 'admin' ? (
            <Button icon={<SendOutlined />} type="primary" onClick={() => setAnnouncementOpen(true)}>
              {t('Envoyer une information')}
            </Button>
          ) : role === 'employee' || role === 'staff' ? (
            <Button icon={<BellOutlined />} type="primary" onClick={() => setRequestOpen(true)}>
              {t('Nouvelle demande')}
            </Button>
          ) : null}
          <Button
            icon={<CheckOutlined />}
            disabled={!unread.data?.count}
            loading={readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            {t('Tout marquer comme lu')}
          </Button>
        </div>
      </div>

      <Card className="notification-center-list" styles={{ body: { padding: '0 16px' } }}>
        <Tabs
          activeKey={state}
          items={notificationTabs.map(tab => ({ ...tab, label: t(tab.label) }))}
          onChange={key => { setState(key as typeof state); setPage(1); }}
        />
        <div className="notification-type-filter">
          <Select
            allowClear
            aria-label={t('Filtrer par type')}
            placeholder={t('Tous les types')}
            value={typeFilter}
            onChange={value => { setTypeFilter(value); setPage(1); }}
            options={[
              'employee_approval', 'account_status', 'shift_admin_closed',
              'operational_request', 'request_update', 'admin_announcement',
            ].map(type => ({ value: type, label: t(notificationTypeLabel(type)) }))}
          />
        </div>
        {notifications.isLoading ? <div style={{ display: 'grid', minHeight: 220, placeItems: 'center' }}><Spin /></div>
          : notifications.isError ? (
            <Alert type="error" showIcon message={t('Impossible de charger les notifications')}
              description={notifications.error instanceof Error ? notifications.error.message : undefined} />
          ) : notifications.data?.items.length ? (
            <>
              <List
                dataSource={notifications.data.items}
                renderItem={item => (
                  <List.Item key={item.id}>
                    <div className="notification-center-item">
                      <span className="notification-row__icon"><BellOutlined /></span>
                      <div className="notification-center-item__content">
                        <Space size={8} wrap>
                          <Typography.Text strong={!item.read_at}>{item.title}</Typography.Text>
                          {!item.read_at && <Tag color="blue">{t('Nouvelle')}</Tag>}
                          {item.priority === 'high' || item.priority === 'urgent'
                            ? <Tag color={item.priority === 'urgent' ? 'red' : 'orange'}>{t('Important')}</Tag> : null}
                        </Space>
                        <Typography.Text type="secondary" className="notification-center-item__message">
                          {item.message}
                        </Typography.Text>
                        <div className="notification-center-item__meta">
                          <Tag>{t(notificationTypeLabel(item.type))}</Tag>
                          <Typography.Text type="secondary">{notificationTimeAgo(item.created_at)}</Typography.Text>
                          {item.action_url && (
                            <Button type="link" size="small" onClick={() => navigate(item.action_url!)}>
                              {t('Ouvrir')}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="notification-center-item__actions">
                        <Button
                          type="text"
                          aria-label={item.read_at ? t('Marquer comme non lue') : t('Marquer comme lue')}
                          icon={item.read_at ? <CheckCircleOutlined /> : <CheckOutlined />}
                          loading={readMutation.isPending && readMutation.variables?.id === item.id}
                          onClick={() => readMutation.mutate({ id: item.id, action: item.read_at ? 'unread' : 'read' })}
                        />
                        <Button
                          type="text"
                          danger
                          aria-label={t('Archiver')}
                          icon={<DeleteOutlined />}
                          onClick={() => readMutation.mutate({ id: item.id, action: 'archive' })}
                        />
                      </div>
                    </div>
                  </List.Item>
                )}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 0' }}>
                <Pagination
                  current={page}
                  pageSize={20}
                  total={notifications.data.total}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              </div>
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune notification pour le moment')} />}
      </Card>

      {(role === 'employee' || role === 'staff') && (
        <Card title={t('Mes demandes')} style={{ marginTop: 16 }}>
          {employeeRequests.isLoading ? <div style={{ display: 'grid', minHeight: 100, placeItems: 'center' }}><Spin /></div>
            : employeeRequests.isError ? (
              <Alert type="error" showIcon message={t('Impossible de charger vos demandes')}
                description={employeeRequests.error instanceof Error ? employeeRequests.error.message : undefined} />
            ) : employeeRequests.data?.items.length ? (
              <List
                dataSource={employeeRequests.data.items}
                renderItem={item => (
                  <List.Item key={item.id}>
                    <div className="employee-request-item">
                      <div>
                        <Typography.Text strong>{item.title}</Typography.Text>
                        <Typography.Text type="secondary" className="notification-center-item__message">
                          {item.message}
                        </Typography.Text>
                        {item.admin_response && (
                          <Typography.Text className="employee-request-item__response">
                            {t('Réponse de l’administration')}: {item.admin_response}
                          </Typography.Text>
                        )}
                        <Typography.Text type="secondary" className="notification-row__time">
                          {notificationTimeAgo(item.created_at)}
                        </Typography.Text>
                      </div>
                      <Tag color={item.status === 'resolved' ? 'green' : item.status === 'rejected' ? 'red' : 'blue'}>
                        {t(({ open: 'Ouverte', in_progress: 'En cours', resolved: 'Résolue', rejected: 'Refusée' } as const)[item.status])}
                      </Tag>
                    </div>
                  </List.Item>
                )}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune demande envoyée')} />}
        </Card>
      )}

      <Modal
        title={t('Envoyer une information aux employés')}
        open={announcementOpen}
        onCancel={() => setAnnouncementOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {employees.isError && <Alert type="error" showIcon message={t('Impossible de charger les employés')} />}
        <Form
          form={announcementForm}
          layout="vertical"
          initialValues={{ recipient: 'all', priority: 'normal' }}
          onFinish={values => announcementMutation.mutate(values)}
        >
          <Form.Item name="recipient" label={t('Destinataires')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'all', label: t('Tous les employés actifs') },
                ...activeEmployees.map(employee => ({
                  value: employee.id, label: `${employee.full_name || employee.email} — ${employee.email}`,
                })),
              ]}
              loading={employees.isLoading}
            />
          </Form.Item>
          <Form.Item name="title" label={t('Titre')} rules={[{ required: true, max: 120 }]}>
            <Input maxLength={120} showCount />
          </Form.Item>
          <Form.Item name="message" label={t('Message')} rules={[{ required: true, max: 2000 }]}>
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="priority" label={t('Priorité')}>
            <Select options={[
              { value: 'low', label: t('Basse') }, { value: 'normal', label: t('Normale') },
              { value: 'high', label: t('Élevée') }, { value: 'urgent', label: t('Urgente') },
            ]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={announcementMutation.isPending}>
            {t('Envoyer')}
          </Button>
        </Form>
      </Modal>

      <Modal
        title={t('Envoyer une demande à l’administration')}
        open={requestOpen}
        onCancel={() => setRequestOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={requestForm} layout="vertical" onFinish={values => requestMutation.mutate(values)}>
          <Form.Item name="type" label={t('Sujet')} rules={[{ required: true }]}>
            <Select options={[
              { value: 'assistance', label: t('Besoin d’aide') },
              { value: 'issue', label: t('Signaler un problème') },
              { value: 'shift_correction', label: t('Correction de service') },
              { value: 'operation_approval', label: t('Demande d’autorisation') },
              { value: 'other', label: t('Autre') },
            ]} />
          </Form.Item>
          <Form.Item name="title" label={t('Titre')} rules={[{ required: true, max: 120 }]}>
            <Input maxLength={120} showCount />
          </Form.Item>
          <Form.Item name="message" label={t('Détails')} rules={[{ required: true, max: 2000 }]}>
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={requestMutation.isPending}>
            {t('Envoyer la demande')}
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
