import React, { useState } from 'react';
import { Table, Space, Popconfirm, message, Tag, Card, Row, Col, Statistic } from 'antd';
import { DeleteOutlined, PlusOutlined, StopOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubscriptions, createSubscription, deleteSubscription, updateSubscription } from './api';
import { getCustomers } from '../customers/api';
import { getPlans } from '../plans/api';
import SubscriptionForm from './SubscriptionForm';
import type { Subscription, SubscriptionInput } from './types';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import { getDateLocale, getNumberLocale } from '../../i18n';
import { formatExpenseAmount } from '../expenses/types';
import { translatePlanName } from '../plans/labels';

const SubscriptionList: React.FC = () => {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
  const dateLocale = getDateLocale(i18n.resolvedLanguage);
  const formatPlanPrice = (price: number) => i18n.resolvedLanguage === 'ar'
    ? formatExpenseAmount(price, numberLocale)
    : `${price.toFixed(3)} DT`;
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
      message.error(t('Erreur lors du chargement des abonnements: {{error}}', { error: error.message }));
    }
  }, [error, t]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success(t("Abonnement créé avec succès"));
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => updateSubscription(id, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success(t("Abonnement annulé"));
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      message.success(t("Abonnement supprimé"));
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
  // Somme de tous les montants d'abonnement, quel que soit leur statut.
  const totalSubscriptionAmount = subscriptions.reduce((total, subscription) => {
    const plan = subscription.plans || plans.find(p => p.id === subscription.plan_id);
    return total + (Number(plan?.price) || 0);
  }, 0);

  const columns = [
    {
      title: t("Client"),
      key: 'customer',
      width: 180,
      render: (_: any, record: Subscription) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>
            {record.customers?.full_name || 'N/A'}
          </div>
          {record.customers?.phone && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {t("📞")}{' '}{record.customers.phone}
            </div>
          )}
          {record.customers?.email && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {t("✉️")}{' '}{record.customers.email}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("Plan"),
      key: 'plan',
      width: 180,
      render: (_: any, record: Subscription) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>
            {record.plans?.name ? translatePlanName(record.plans.name, t) : t('N/A')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {record.plans?.duration_days?.toLocaleString(numberLocale) ?? t('N/A')} {t("jours •")}{' '}{record.plans?.price == null
              ? t("N/A")
              : formatPlanPrice(Number(record.plans.price))}
          </div>
        </div>
      ),
    },
    {
      title: t("Date de début"),
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date: string) => (
        <div style={{ fontSize: 13 }}>
          {new Date(date).toLocaleDateString(dateLocale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      ),
    },
    {
      title: t("Date de fin"),
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (date: string) => (
        <div style={{ fontSize: 13 }}>
          {new Date(date).toLocaleDateString(dateLocale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      ),
    },
    {
      title: t("Durée restante"),
      key: 'remaining',
      width: 120,
      render: (_: any, record: Subscription) => {
        const today = new Date();
        const endDate = new Date(record.end_date);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (record.status === 'cancelled') {
          return <span style={{ color: '#94a3b8' }}>{t("—")}</span>;
        }
        
        if (diffDays < 0) {
          return (
            <span style={{ color: '#ef4444', fontWeight: 500 }}>
              {t("Expiré depuis")}{' '}{Math.abs(diffDays).toLocaleString(numberLocale)} {t("j")}{' '}</span>
          );
        }
        
        if (diffDays === 0) {
          return <span style={{ color: '#f59e0b', fontWeight: 500 }}>{t("Expire aujourd'hui")}</span>;
        }
        
        if (diffDays <= 3) {
          return <span style={{ color: '#f59e0b', fontWeight: 500 }}>{diffDays.toLocaleString(numberLocale)} {t(diffDays === 1 ? "jour" : "jours")}</span>;
        }
        
        return <span style={{ color: '#10b981', fontWeight: 500 }}>{diffDays.toLocaleString(numberLocale)} {t("jours")}</span>;
      },
    },
    {
      title: t("Statut"),
      key: 'status',
      width: 100,
      render: (_: any, record: Subscription) => {
        const today = new Date().toISOString().split('T')[0];
        const isExpired = record.end_date < today;
        
        if (record.status === 'cancelled') return <Tag color="red">{t("Annulé")}</Tag>;
        if (isExpired) return <Tag color="orange">{t("Expiré")}</Tag>;
        return <Tag color="green">{t("Actif")}</Tag>;
      },
    },
    {
      title: t("Actions"),
      key: 'actions',
      width: 120,
      render: (_: any, record: Subscription) => (
        <Space size="middle">
          {record.status !== 'cancelled' && (
            isDemo ? (
              <AuthButton type="text" danger icon={<StopOutlined />} title={t("Annuler")} />
            ) : (
              <Popconfirm
                title={t("Annuler l'abonnement")}
                description={t("Êtes-vous sûr de vouloir annuler ?")}
                onConfirm={() => cancelMutation.mutate(record.id)}
                okText={t("Oui")}
                cancelText={t("Non")}
              >
                <AuthButton type="text" danger icon={<StopOutlined />} title={t("Annuler")} />
              </Popconfirm>
            )
          )}
          {isDemo ? (
            <AuthButton type="text" danger icon={<DeleteOutlined />} />
          ) : (
            <Popconfirm
              title={t("Supprimer l'abonnement")}
              description={t("Êtes-vous sûr de vouloir supprimer cet enregistrement ?")}
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText={t("Oui")}
              cancelText={t("Non")}
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>{t("Gestion des Abonnements")}</h2>
          <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => {
            if (!requireAdmin()) return;
            setIsModalOpen(true);
          }}>
            {t("Nouvel abonnement")}{' '}</AuthButton>
        </div>

        {/* Statistics Cards */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title={t("Total Abonnements")}
                value={subscriptions.length}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#3b82f6', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title={t("Actifs")}
                value={activeCount}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#10b981', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title={t("Expirés")}
                value={expiredCount}
                valueStyle={{ color: '#f59e0b', fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title={t("Montant total des abonnements")}
                value={i18n.resolvedLanguage === 'ar'
                  ? totalSubscriptionAmount.toLocaleString(numberLocale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                  : totalSubscriptionAmount.toFixed(3)}
                suffix={t("DT")}
                valueStyle={{ color: '#8b5cf6', fontSize: 20 }}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table
          columns={columns}
          dataSource={subscriptions}
          rowKey="id"
          loading={isLoading}
          pagination={{
            defaultPageSize: 5,
            showTotal: total => total === 1
              ? t('Total : 1 abonnement')
              : t('Total : {{count}} abonnements', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20', '50']
          }}
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
