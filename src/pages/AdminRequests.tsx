import { useState } from 'react';
import {
  Alert, Button, Card, Empty, Form, Input, List, Modal, Pagination, Select, Space,
  Spin, Tag, Typography, message,
} from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { apiRequest, jsonBody } from '../lib/api';
import '../features/notifications/notifications.css';

type OperationalRequest = {
  id: string;
  employee_id: string;
  type: string;
  title: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  admin_response: string | null;
  created_at: string;
  employee: { name: string; email: string } | null;
};
type RequestPage = { items: OperationalRequest[]; total: number };
type ResponseValues = { status: OperationalRequest['status']; response: string };

const statusColors: Record<OperationalRequest['status'], string> = {
  open: 'blue', in_progress: 'gold', resolved: 'green', rejected: 'red',
};
const requestStatusLabels: Record<OperationalRequest['status'], string> = {
  open: 'Ouverte', in_progress: 'En cours', resolved: 'Résolue', rejected: 'Refusée',
};
const requestTypeLabels: Record<string, string> = {
  assistance: 'Besoin d’aide',
  issue: 'Problème signalé',
  shift_correction: 'Correction de service',
  operation_approval: 'Demande d’autorisation',
  other: 'Autre',
};

export default function AdminRequests() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OperationalRequest | null>(null);
  const requests = useQuery({
    queryKey: ['admin-requests', page],
    queryFn: () => apiRequest<RequestPage>(`admin/requests?page=${page}&limit=20`),
  });
  const updateRequest = useMutation({
    mutationFn: ({ id, ...values }: ResponseValues & { id: string }) =>
      apiRequest(`admin/requests/${id}`, { method: 'PATCH', body: jsonBody(values) }),
    onSuccess: async () => {
      setSelected(null);
      message.success(t('La demande a été mise à jour'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
    onError: error => message.error(error instanceof Error ? error.message : t('Mise à jour impossible')),
  });

  return (
    <main className="notifications-page">
      <div className="notifications-page__heading">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>{t('Demandes des employés')}</Typography.Title>
          <Typography.Text type="secondary">
            {t('Consultez les demandes et transmettez une réponse à leur auteur.')}
          </Typography.Text>
        </div>
      </div>
      <Card className="admin-request-list" styles={{ body: { padding: 16 } }}>
        {requests.isLoading ? <div style={{ display: 'grid', minHeight: 220, placeItems: 'center' }}><Spin /></div>
          : requests.isError ? (
            <Alert type="error" showIcon message={t('Impossible de charger les demandes')}
              description={requests.error instanceof Error ? requests.error.message : undefined} />
          ) : requests.data?.items.length ? (
            <>
              <List
                dataSource={requests.data.items}
                renderItem={request => (
                  <List.Item key={request.id}>
                    <Card className="admin-request-card" size="small">
                      <div className="notification-center-item">
                        <span className="notification-row__icon"><ClockCircleOutlined /></span>
                        <div className="notification-center-item__content">
                          <Space wrap>
                            <Typography.Text strong>{request.title}</Typography.Text>
                            <Tag>{t(requestTypeLabels[request.type] || 'Autre')}</Tag>
                            <Tag color={statusColors[request.status]}>{t(requestStatusLabels[request.status])}</Tag>
                          </Space>
                          <Typography.Text type="secondary" className="notification-center-item__message">
                            {request.message}
                          </Typography.Text>
                          <div className="notification-center-item__meta">
                            <Typography.Text type="secondary">
                              {request.employee?.name || request.employee?.email || request.employee_id}
                            </Typography.Text>
                            <Typography.Text type="secondary">{dayjs(request.created_at).format('D MMM YYYY, HH:mm')}</Typography.Text>
                            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => setSelected(request)}>
                              {t('Répondre')}
                            </Button>
                          </div>
                          {request.admin_response && (
                            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                              {t('Dernière réponse')}: {request.admin_response}
                            </Typography.Paragraph>
                          )}
                        </div>
                      </div>
                    </Card>
                  </List.Item>
                )}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 0' }}>
                <Pagination current={page} pageSize={20} total={requests.data.total}
                  showSizeChanger={false} onChange={setPage} />
              </div>
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune demande pour le moment')} />}
      </Card>

      <Modal
        title={t('Répondre à la demande')}
        open={Boolean(selected)}
        onCancel={() => setSelected(null)}
        footer={null}
        destroyOnHidden
      >
        {selected && (
          <Form
            key={selected.id}
            layout="vertical"
            initialValues={{ status: selected.status, response: selected.admin_response || '' }}
            onFinish={(values: ResponseValues) => updateRequest.mutate({ id: selected.id, ...values })}
          >
            <Typography.Paragraph type="secondary">{selected.title} — {selected.employee?.name}</Typography.Paragraph>
            <Form.Item name="status" label={t('État')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'open', label: t('Ouverte') },
                { value: 'in_progress', label: t('En cours') },
                { value: 'resolved', label: t('Résolue') },
                { value: 'rejected', label: t('Refusée') },
              ]} />
            </Form.Item>
            <Form.Item name="response" label={t('Réponse')} rules={[{ required: true, max: 2000 }]}>
              <Input.TextArea rows={4} maxLength={2000} showCount />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={updateRequest.isPending}>
              {t('Enregistrer la réponse')}
            </Button>
          </Form>
        )}
      </Modal>
    </main>
  );
}
