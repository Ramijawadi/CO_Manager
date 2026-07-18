import React, { useState } from 'react';
import { Table, Button, message, Select, Modal, Input, Form } from 'antd';
import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveSessions, createSession, checkoutSession } from './api';
import { getCustomers, createCustomer } from '../customers/api';
import type { Session } from './types';
import { calculateDuration, calculateTimeCost } from '../../utils/time';
import SessionConsumptionPanel from './SessionConsumptionPanel';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';

const SessionList: React.FC = () => {
  const queryClient = useQueryClient();
  const { requireAdmin, isDemo } = usePermissions();
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [visitorMode, setVisitorMode] = useState(false);
  const [form] = Form.useForm();
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  // Queries
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['activeSessions'],
    queryFn: getActiveSessions,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  // Mutations
  const checkoutMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => checkoutSession(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success('Paiement effectué avec succès');
      setCheckoutDetails(null);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const checkInMutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success('Enregistré avec succès');
      setIsCheckInModalOpen(false);
      form.resetFields();
    },
    onError: (error: Error) => message.error(error.message),
  });

  const quickVisitorMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (newCustomer) => {
      checkInMutation.mutate({ customer_id: newCustomer.id });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const [checkoutDetails, setCheckoutDetails] = useState<{
    session: Session;
    timeCost: number;
    productCost: number;
    isSubscribed: boolean;
  } | null>(null);

  const handleInitiateCheckout = async (session: Session) => {
    if (!requireAdmin()) return;
    const exitTime = new Date().toISOString();
    const durationHours = calculateDuration(session.entry_time, exitTime);
    let timeCost = 0;
    let isSubscribed = false;

    try {
      const { getActiveSubscription } = await import('../subscriptions/api');
      const activeSub = await getActiveSubscription(session.customer_id);
      
      if (activeSub) {
        timeCost = 0;
        isSubscribed = true;
      } else {
        const { getSettings } = await import('../settings/api');
        const settings = await getSettings();
        timeCost = calculateTimeCost(durationHours, settings?.hourly_rate || 1);
      }

      const productCost = (session.session_products || []).reduce((acc, curr) => acc + curr.total_price, 0);

      setCheckoutDetails({
        session,
        timeCost,
        productCost,
        isSubscribed
      });
    } catch (error) {
      message.error('Échec du calcul des détails de facturation');
    }
  };

  const handleConfirmCheckout = () => {
    if (!requireAdmin()) return;
    if (!checkoutDetails) return;
    const { session, timeCost } = checkoutDetails;

    checkoutMutation.mutate({
      id: session.id,
      data: {
        exit_time: new Date().toISOString(),
        status: 'completed',
        time_cost: timeCost,
      },
    });
  };

  const handleCheckInSubmit = () => {
    if (!requireAdmin()) return;
    form.submit();
  };

  const handleCheckInFinish = (values: any) => {
    if (!requireAdmin()) return;
    if (visitorMode) {
      // Create quick visitor first
      const payload: any = {
        full_name: values.full_name,
        notes: 'Visiteur rapide',
      };
      if (values.email) payload.email = values.email;
      if (values.phone) payload.phone = values.phone;

      quickVisitorMutation.mutate(payload);
    } else {
      // Direct check-in with selected customer
      checkInMutation.mutate({ customer_id: values.customer_id });
    }
  };

  const columns = [
    {
      title: 'Client',
      dataIndex: ['customers', 'full_name'],
      key: 'customer_name',
    },
    {
      title: "Heure d'entrée",
      dataIndex: 'entry_time',
      key: 'entry_time',
      render: (val: string) => new Date(val).toLocaleString('fr-FR'),
    },
    {
      title: "Heure de sortie",
      dataIndex: 'exit_time',
      key: 'exit_time',
      render: (val: string | null) => val
        ? new Date(val).toLocaleString('fr-FR')
        : <span style={{ color: '#f59e0b' }}>En cours</span>,
    },
    {
      title: 'Durée (h)',
      key: 'duration',
      render: (_: any, record: Session) => {
        const start = new Date(record.entry_time).getTime();
        const end = record.exit_time ? new Date(record.exit_time).getTime() : Date.now();
        const hours = ((end - start) / (1000 * 60 * 60)).toFixed(1);
        return `${hours}h`;
      },
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <span style={{ color: 'green' }}>{val.toUpperCase()}</span>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: Session) => (
        <AuthButton 
          type="primary" 
          danger 
          icon={<CheckCircleOutlined />} 
          onClick={() => handleInitiateCheckout(record)}
        >
          Clôturer
        </AuthButton>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingTop: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Sessions Actives</h2>
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => {
          if (!requireAdmin()) return;
          setIsCheckInModalOpen(true);
        }}>
          Nouvelle session
        </AuthButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={isLoading}
          pagination={{ defaultPageSize: 5, showTotal: (total) => `Total: ${total} session${total > 1 ? 's' : ''}` }}

          expandable={{
            expandedRowRender: (record) => (
              <SessionConsumptionPanel session={record} onClose={() => setExpandedRowKeys([])} />
            ),
            expandedRowKeys,
            onExpandedRowsChange: (keys: readonly React.Key[]) => setExpandedRowKeys([...keys]),
            rowExpandable: () => true,
          }}
        />
      </div>

      <Modal
        title="Nouvel enregistrement"
        open={isCheckInModalOpen}
        onCancel={() => {
          setIsCheckInModalOpen(false);
          setVisitorMode(false);
          form.resetFields();
        }}
        onOk={handleCheckInSubmit}
        confirmLoading={checkInMutation.isPending || quickVisitorMutation.isPending}
        okButtonProps={{ disabled: isDemo, title: isDemo ? 'Available for administrators only.' : undefined }}
      >
        <Form form={form} layout="vertical" onFinish={handleCheckInFinish}>
          <div style={{ marginBottom: 16 }}>
            <Button 
              type={!visitorMode ? 'primary' : 'default'} 
              onClick={() => setVisitorMode(false)}
              style={{ marginRight: 8 }}
            >
              Sélectionner un client
            </Button>
            <Button 
              type={visitorMode ? 'primary' : 'default'} 
              onClick={() => setVisitorMode(true)}
            >
              Visiteur rapide
            </Button>
          </div>

          {!visitorMode ? (
            <Form.Item
              name="customer_id"
              label="Sélectionner un client"
              rules={[{ required: true, message: 'Veuillez sélectionner un client' }]}
            >
              <Select
                showSearch
                placeholder="Rechercher un client"
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={customers.map(c => ({ value: c.id, label: c.full_name }))}
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="full_name"
                label="Nom complet"
                rules={[{ required: true, message: 'Veuillez entrer le nom du visiteur' }]}
              >
                <Input placeholder="Nom du visiteur" />
              </Form.Item>
              <Form.Item name="phone" label="Téléphone (Optionnel)">
                <Input placeholder="Numéro de téléphone" />
              </Form.Item>
            </>
          )}
          <button type="submit" style={{ display: 'none' }}>Submit</button>
        </Form>
      </Modal>

      <Modal
        title="Résumé de la session"
        open={!!checkoutDetails}
        onCancel={() => setCheckoutDetails(null)}
        onOk={handleConfirmCheckout}
        okText="Confirmer et Terminer"
        confirmLoading={checkoutMutation.isPending}
        okButtonProps={{ disabled: isDemo, title: isDemo ? 'Available for administrators only.' : undefined }}
      >
        {checkoutDetails && (
          <div style={{ fontSize: '16px' }}>
            <p><strong>Client :</strong> {checkoutDetails.session.customers?.full_name}</p>
            {checkoutDetails.isSubscribed ? (
              <p style={{ color: 'green' }}>✓ Couvert par un abonnement actif</p>
            ) : (
              <p><strong>Coût de temps :</strong> {checkoutDetails.timeCost.toFixed(2)} DT</p>
            )}
            <p><strong>Coût des produits :</strong> {checkoutDetails.productCost.toFixed(2)} DT</p>
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
              <h3><strong>Total à payer :</strong> {(checkoutDetails.timeCost + checkoutDetails.productCost).toFixed(2)} DT</h3>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SessionList;
