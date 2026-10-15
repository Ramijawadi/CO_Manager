import { useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';
import { formatExpenseAmount } from '../expenses/types';
import { getSubscriptions } from './api';
import {
  createSubscriptionPayment, deleteSubscriptionPayment, getSubscriptionPayments, updateSubscriptionPayment,
} from './paymentsApi';
import type { SubscriptionPayment } from './paymentsApi';

interface PaymentValues {
  subscription_id?: string;
  amount: number;
  payment_date: Dayjs;
  notes?: string;
}

export default function PaymentList() {
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPayment>();
  const { requireAdmin, isDemo } = usePermissions();
  const queryClient = useQueryClient();
  const payments = useQuery({ queryKey: ['subscriptionPayments'], queryFn: getSubscriptionPayments });
  const subscriptions = useQuery({ queryKey: ['subscriptions'], queryFn: getSubscriptions });
  const saved = () => {
    void queryClient.invalidateQueries({ queryKey: ['subscriptionPayments'] });
    void queryClient.invalidateQueries({ queryKey: ['financialReport'] });
    setOpen(false);
    void messageApi.success('Paiement enregistré');
  };
  const failed = (error: Error) => { void messageApi.error(error.message); };
  const createMutation = useMutation({ mutationFn: createSubscriptionPayment, onSuccess: saved, onError: failed });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<PaymentValues, 'subscription_id' | 'payment_date'>> & { payment_date: string } }) =>
      updateSubscriptionPayment(id, input),
    onSuccess: saved, onError: failed,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSubscriptionPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptionPayments'] });
      void queryClient.invalidateQueries({ queryKey: ['financialReport'] });
      void messageApi.success('Paiement supprimé');
    },
    onError: failed,
  });
  const saving = createMutation.isPending || updateMutation.isPending;
  const edit = (payment?: SubscriptionPayment) => {
    if (!requireAdmin()) return;
    setEditing(payment);
    setOpen(true);
  };
  const submit = (values: PaymentValues) => {
    if (!requireAdmin() || saving) return;
    const input = { amount: values.amount, payment_date: values.payment_date.format('YYYY-MM-DD'), notes: values.notes?.trim() ?? '' };
    if (editing) updateMutation.mutate({ id: editing.id, input });
    else if (values.subscription_id) createMutation.mutate({ ...input, subscription_id: values.subscription_id });
    else void messageApi.error('Veuillez sélectionner un abonnement');
  };
  const columns: TableColumnsType<SubscriptionPayment> = [
    { title: 'Client', dataIndex: 'customer_name' },
    { title: 'Plan', dataIndex: 'plan_name' },
    { title: 'Date du paiement', dataIndex: 'payment_date', render: (date: string) => dayjs(date).format('DD/MM/YYYY') },
    { title: 'Montant reçu', dataIndex: 'amount', align: 'right', render: formatExpenseAmount },
    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
    { title: 'Actions', width: 120, render: (_: unknown, row) => (
      <Space>
        <AuthButton type="text" icon={<EditOutlined />} aria-label={`Modifier le paiement de ${row.customer_name}`} onClick={() => edit(row)} />
        {isDemo ? <AuthButton type="text" danger icon={<DeleteOutlined />} /> : (
          <Popconfirm title="Supprimer le paiement" description="Ce paiement sera retiré des revenus."
            okText="Oui" cancelText="Non" onConfirm={() => { if (requireAdmin()) deleteMutation.mutate(row.id); }}>
            <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label={`Supprimer le paiement de ${row.customer_name}`}
              disabled={deleteMutation.isPending} loading={deleteMutation.isPending && deleteMutation.variables === row.id} />
          </Popconfirm>
        )}
      </Space>
    ) },
  ];
  return (
    <div style={{ padding: '20px 24px' }}>
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert type="info" showIcon title="Enregistrez uniquement les montants réellement reçus"
          description="Chaque versement est compté à sa date de paiement, même en plusieurs fois. Les anciens abonnements ne sont pas considérés comme payés automatiquement. Annuler ou supprimer un abonnement ne supprime pas ses paiements." />
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => edit()}>Nouveau paiement</AuthButton>
        {payments.error && <Alert type="error" showIcon title="Impossible de charger les paiements" description={payments.error.message}
          action={<Button onClick={() => { void payments.refetch(); }}>Réessayer</Button>} />}
        <Table columns={columns} rowKey="id" dataSource={payments.data} loading={payments.isLoading}
          scroll={{ x: 800 }} pagination={{ defaultPageSize: 5, showSizeChanger: true }} />
      </Space>
      <Modal title={editing ? 'Modifier le paiement' : 'Enregistrer un paiement'} open={open}
        onCancel={() => { if (!saving) setOpen(false); }} destroyOnHidden
        okText="Enregistrer" cancelText="Annuler" confirmLoading={saving}
        okButtonProps={{ htmlType: 'submit', form: 'subscription-payment-form',
          disabled: !editing && (subscriptions.isLoading || !!subscriptions.error || !subscriptions.data?.length) }}
        cancelButtonProps={{ disabled: saving }} closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
        {!editing && subscriptions.error && <Alert type="error" title="Impossible de charger les abonnements"
          description={subscriptions.error.message} action={<Button onClick={() => { void subscriptions.refetch(); }}>Réessayer</Button>} />}
        {!editing && !subscriptions.isLoading && !subscriptions.error && !subscriptions.data?.length &&
          <Alert type="warning" title="Créez un abonnement avant de saisir un paiement." />}
        {editing && <Typography.Paragraph>{editing.customer_name} — {editing.plan_name}</Typography.Paragraph>}
        <Form<PaymentValues> id="subscription-payment-form" layout="vertical" preserve={false} disabled={saving}
          initialValues={{ amount: editing?.amount, payment_date: editing ? dayjs(editing.payment_date) : dayjs(), notes: editing?.notes ?? '' }}
          onFinish={submit}>
          {!editing && <Form.Item name="subscription_id" label="Abonnement" rules={[{ required: true, message: 'Veuillez sélectionner un abonnement' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Sélectionner un abonnement"
              loading={subscriptions.isLoading}
              options={subscriptions.data?.map(row => ({
                value: row.id,
                label: `${row.customers?.full_name ?? 'Client supprimé'} — ${row.plans?.name ?? 'Plan supprimé'} (${dayjs(row.start_date).format('DD/MM/YYYY')})`,
              }))} />
          </Form.Item>}
          <Form.Item name="amount" label="Montant reçu (DT)" rules={[
            { required: true, message: 'Veuillez entrer le montant reçu' },
            { type: 'number', min: 0.001, max: 1_000_000_000, message: 'Le montant doit être compris entre 0,001 et 1 000 000 000 DT' },
          ]}>
            <InputNumber min={0.001} max={1_000_000_000} precision={3} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_date" label="Date du paiement" rules={[{ required: true, message: 'Veuillez choisir une date' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} maxLength={10000} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
