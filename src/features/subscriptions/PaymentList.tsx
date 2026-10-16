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
import { useTranslation } from 'react-i18next';
import { getNumberLocale } from '../../i18n';
import { translatePlanName } from '../plans/labels';

interface PaymentValues {
  subscription_id?: string;
  amount: number;
  payment_date: Dayjs;
  notes?: string;
}

export default function PaymentList() {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
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
    void messageApi.success(t('Paiement enregistré'));
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
      void messageApi.success(t('Paiement supprimé'));
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
    else void messageApi.error(t('Veuillez sélectionner un abonnement'));
  };
  const columns: TableColumnsType<SubscriptionPayment> = [
    { title: t("Client"), dataIndex: 'customer_name' },
    { title: t("Plan"), dataIndex: 'plan_name', render: (name: string) => translatePlanName(name, t) },
    { title: t("Date du paiement"), dataIndex: 'payment_date', render: (date: string) => dayjs(date).format('DD/MM/YYYY') },
    { title: t("Montant reçu"), dataIndex: 'amount', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale) },
    { title: t("Notes"), dataIndex: 'notes', ellipsis: true },
    { title: t("Actions"), width: 120, render: (_: unknown, row) => (
      <Space>
        <AuthButton type="text" icon={<EditOutlined />} aria-label={`Modifier le paiement de ${row.customer_name}`} onClick={() => edit(row)} />
        {isDemo ? <AuthButton type="text" danger icon={<DeleteOutlined />} /> : (
          <Popconfirm title={t("Supprimer le paiement")} description={t("Ce paiement sera retiré des revenus.")}
            okText={t("Oui")} cancelText={t("Non")} onConfirm={() => { if (requireAdmin()) deleteMutation.mutate(row.id); }}>
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
        <Alert type="info" showIcon title={t("Enregistrez uniquement les montants réellement reçus")}
          description={t("Chaque versement est compté à sa date de paiement, même en plusieurs fois. Les anciens abonnements ne sont pas considérés comme payés automatiquement. Annuler ou supprimer un abonnement ne supprime pas ses paiements.")} />
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => edit()}>{t("Nouveau paiement")}</AuthButton>
        {payments.error && <Alert type="error" showIcon title={t("Impossible de charger les paiements")} description={payments.error.message}
          action={<Button onClick={() => { void payments.refetch(); }}>{t("Réessayer")}</Button>} />}
        <Table columns={columns} rowKey="id" dataSource={payments.data} loading={payments.isLoading}
          scroll={{ x: 800 }} pagination={{ defaultPageSize: 5, showSizeChanger: true }} />
      </Space>
      <Modal title={editing ? t("Modifier le paiement") : t("Enregistrer un paiement")} open={open}
        onCancel={() => { if (!saving) setOpen(false); }} destroyOnHidden
        okText={t("Enregistrer")} cancelText={t("Annuler")} confirmLoading={saving}
        okButtonProps={{ htmlType: 'submit', form: 'subscription-payment-form',
          disabled: !editing && (subscriptions.isLoading || !!subscriptions.error || !subscriptions.data?.length) }}
        cancelButtonProps={{ disabled: saving }} closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
        {!editing && subscriptions.error && <Alert type="error" title={t("Impossible de charger les abonnements")}
          description={subscriptions.error.message} action={<Button onClick={() => { void subscriptions.refetch(); }}>{t("Réessayer")}</Button>} />}
        {!editing && !subscriptions.isLoading && !subscriptions.error && !subscriptions.data?.length &&
          <Alert type="warning" title={t("Créez un abonnement avant de saisir un paiement.")} />}
        {editing && <Typography.Paragraph>{editing.customer_name} {t("—")}{' '}{translatePlanName(editing.plan_name, t)}</Typography.Paragraph>}
        <Form<PaymentValues> id="subscription-payment-form" layout="vertical" preserve={false} disabled={saving}
          initialValues={{ amount: editing?.amount, payment_date: editing ? dayjs(editing.payment_date) : dayjs(), notes: editing?.notes ?? '' }}
          onFinish={submit}>
          {!editing && <Form.Item name="subscription_id" label={t("Abonnement")} rules={[{ required: true, message: t("Veuillez sélectionner un abonnement") }]}>
            <Select showSearch optionFilterProp="label" placeholder={t("Sélectionner un abonnement")}
              loading={subscriptions.isLoading}
              options={subscriptions.data?.map(row => ({
                value: row.id,
                label: `${row.customers?.full_name ?? t("Client supprimé")} — ${row.plans?.name ? translatePlanName(row.plans.name, t) : t("Plan supprimé")} (${dayjs(row.start_date).format('DD/MM/YYYY')})`,
              }))} />
          </Form.Item>}
          <Form.Item name="amount" label={t("Montant reçu (DT)")} rules={[
            { required: true, message: t("Veuillez entrer le montant reçu") },
            { type: 'number', min: 0.001, max: 1_000_000_000, message: t("Le montant doit être compris entre 0,001 et 1 000 000 000 DT") },
          ]}>
            <InputNumber min={0.001} max={1_000_000_000} precision={3} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_date" label={t("Date du paiement")} rules={[{ required: true, message: t("Veuillez choisir une date") }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label={t("Notes")}><Input.TextArea rows={2} maxLength={10000} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
