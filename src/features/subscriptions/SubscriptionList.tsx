import React, { useState } from 'react';
import { Table, Space, Popconfirm, message, Tag, Card, Row, Col, Statistic } from 'antd';
import { DeleteOutlined, PlusOutlined, StopOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubscriptions, createSubscription, deleteSubscription, updateSubscription } from './api';
import { getCustomers } from '../customers/api';
import SubscriptionForm from './SubscriptionForm';
import type { Subscription, SubscriptionInput } from './types';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';

const SubscriptionList: React.FC = () => {
  const queryClient = useQueryClient();
  const { requireAdmin, isDemo } = usePermissions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Queries
  const { data: subscriptions = [], isLoading, error } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getSubscriptions,
    refetchOnWindowFocus: true,
  });

  // Show error message if query fails
  React.useEffect(() => {
    if (error) {
      console.error('Error loading subscriptions:', error);
      message.error(`Erreur lors du chargement des abonnements: ${error.message}`);
    }
  }, [error]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success('Abonnement créé avec succès');
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => updateSubscription(id, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success('Abonnement annulé');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success('Abonnement supprimé');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleModalSubmit = (values: SubscriptionInput) => {
    if (!requireAdmin()) return;
    createMutation.mutate(values);
  };

  // Calculate statistics
  const today = new Date().toISOString().split('T')[0];
  const activeCount = subscriptions.filter(s => 
    s.status === 'active' && s.end_date >= today
  ).length;
  const expiredCount = subscriptions.filter(s => 
    s.end_date < today && s.status !== 'cancelled'
  ).length;
  const totalRevenue = subscriptions
    .filter(s => s.status === 'active' || s.end_date >= today)
    .reduce((acc, s) => acc + (s.plans?.price || 0), 0);

  const columns = [
    {
      title: 'Client',
      key: 'customer',
      width: 180,
      render: (_: any, record: Subscription) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>
            {record.customers?.full_name || 'N/A'}
          </div>
          {record.customers?.phone && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              📞 {record.customers.phone}
            </div>
          )}
          {record.customers?.email && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              ✉️ {record.customers.email}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Plan',
      key: 'plan',
      width: 180,
      render: (_: any, record: Subscription) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>
            {record.plans?.name || 'N/A'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {record.plans?.duration_days} jours • {record.plans?.price} DT
          </div>
        </div>
      ),
    },
    {
      title: 'Date de début',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date: string) => (
        <div style={{ fontSize: 13 }}>
          {new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      ),
    },
    {
      title: 'Date de fin',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (date: string) => (
        <div style={{ fontSize: 13 }}>
          {new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      ),
    },
    {
      title: 'Durée restante',
      key: 'remaining',
      width: 120,
      render: (_: any, record: Subscription) => {
        const today = new Date();
        const endDate = new Date(record.end_date);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (record.status === 'cancelled') {
          return <span style={{ color: '#94a3b8' }}>—</span>;
        }
        
        if (diffDays < 0) {
          return (
            <span style={{ color: '#ef4444', fontWeight: 500 }}>
              Expiré depuis {Math.abs(diffDays)} j
            </span>
          );
        }
        
        if (diffDays === 0) {
          return <span style={{ color: '#f59e0b', fontWeight: 500 }}>Expire aujourd'hui</span>;
        }
        
        if (diffDays <= 3) {
          return <span style={{ color: '#f59e0b', fontWeight: 500 }}>{diffDays} jour{diffDays > 1 ? 's' : ''}</span>;
        }
        
        return <span style={{ color: '#10b981', fontWeight: 500 }}>{diffDays} jours</span>;
      },
    },
    {
      title: 'Statut',
      key: 'status',
      width: 100,
      render: (_: any, record: Subscription) => {
        const today = new Date().toISOString().split('T')[0];
        const isExpired = record.end_date < today;
        
        if (record.status === 'cancelled') return <Tag color="red">Annulé</Tag>;
        if (isExpired) return <Tag color="orange">Expiré</Tag>;
        return <Tag color="green">Actif</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, record: Subscription) => (
        <Space size="middle">
          {record.status !== 'cancelled' && (
            isDemo ? (
              <AuthButton type="text" danger icon={<StopOutlined />} title="Annuler" />
            ) : (
              <Popconfirm
                title="Annuler l'abonnement"
                description="Êtes-vous sûr de vouloir annuler ?"
                onConfirm={() => cancelMutation.mutate(record.id)}
                okText="Oui"
                cancelText="Non"
              >
                <AuthButton type="text" danger icon={<StopOutlined />} title="Annuler" />
              </Popconfirm>
            )
          )}
          {isDemo ? (
            <AuthButton type="text" danger icon={<DeleteOutlined />} />
          ) : (
            <Popconfirm
              title="Supprimer l'abonnement"
              description="Êtes-vous sûr de vouloir supprimer cet enregistrement ?"
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="Oui"
              cancelText="Non"
            >
              <AuthButton type="text" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === record.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 24px' }}>
      <div style={{ marginBottom: 16, flexShrink: 0, paddingTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>Gestion des Abonnements</h2>
          <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => {
            if (!requireAdmin()) return;
            setIsModalOpen(true);
          }}>
            Nouvel abonnement
          </AuthButton>
        </div>

        {/* Statistics Cards */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total Abonnements"
                value={subscriptions.length}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#3b82f6', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Actifs"
                value={activeCount}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#10b981', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Expirés"
                value={expiredCount}
                valueStyle={{ color: '#f59e0b', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Revenu Actif"
                value={totalRevenue}
                suffix="DT"
                valueStyle={{ color: '#8b5cf6', fontSize: 20 }}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={subscriptions}
          rowKey="id"
          loading={isLoading}
          pagination={{
            defaultPageSize: 10,
            size: 'small',
            showTotal: (total) => `Total: ${total} abonnement${total > 1 ? 's' : ''}`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100']
          }}
          style={{ height: '100%' }}
          scroll={{ x: 1000, y: 'calc(100vh - 420px)' }}
        />
      </div>

      <SubscriptionForm
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        customers={customers}
        loading={createMutation.isPending}
      />
    </div>
  );
};

export default SubscriptionList;
