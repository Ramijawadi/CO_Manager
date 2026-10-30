import React, { useEffect } from 'react';
import { Alert, Button, Form, Modal, Select, DatePicker } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getPlans } from '../plans/api';
import { getSubscriptions } from './api';
import type { SubscriptionInput, Subscription } from './types';
import type { Customer } from '../customers/types';
import dayjs from 'dayjs';
import { isUuid } from '../../utils/uuid';
import { useTranslation } from 'react-i18next';
import { getNumberLocale } from '../../i18n';
import { formatExpenseAmount } from '../expenses/types';
import { translatePlanName } from '../plans/labels';

interface SubscriptionFormValues {
  customer_id: string;
  plan_id: string;
  start_date: dayjs.Dayjs;
}

interface SubscriptionFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: SubscriptionInput) => void;
  customers: Customer[];
  initialValues?: Subscription;
  loading?: boolean;
}

const SubscriptionForm: React.FC<SubscriptionFormProps> = ({ open, onCancel, onSubmit, customers, initialValues, loading }) => {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
  const formatPlanPrice = (price: number) => i18n.resolvedLanguage === 'ar'
    ? formatExpenseAmount(price, numberLocale)
    : `${price.toFixed(3)} DT`;
  const [form] = Form.useForm<SubscriptionFormValues>();
  const selectedPlanId = Form.useWatch('plan_id', form);

  const { data: plans = [], isFetching: plansLoading, error: plansError, refetch } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  });
  const {
    data: subscriptions = [], isPending: subscriptionsPending, isFetching: subscriptionsFetching,
    error: subscriptionsError, refetch: refetchSubscriptions,
  } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getSubscriptions,
    enabled: open,
  });

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const plansUnavailable = plansLoading || !!plansError || plans.length === 0;
  const subscriptionsUnavailable = subscriptionsPending || subscriptionsFetching || !!subscriptionsError;
  const today = new Date().toISOString().slice(0, 10);
  const subscribedCustomers = new Set(subscriptions
    .filter(subscription => subscription.id !== initialValues?.id &&
      subscription.status === 'active' && subscription.end_date >= today)
    .map(subscription => subscription.customer_id));

  useEffect(() => {
    if (open) {
      if (initialValues) {
        form.setFieldsValue({
          customer_id: initialValues.customer_id,
          plan_id: initialValues.plan_id ?? undefined,
          start_date: dayjs(initialValues.start_date),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ start_date: dayjs() });
      }
    }
  }, [open, initialValues, form]);

  const handleOk = () => {
    form.submit();
  };

  const handleFinish = (values: SubscriptionFormValues) => {
    if (subscriptionsUnavailable) {
      form.setFields([{ name: 'customer_id', errors: [t('Impossible de vérifier les abonnements en cours')] }]);
      return;
    }
    if (subscribedCustomers.has(values.customer_id)) {
      form.setFields([{ name: 'customer_id', errors: [t('Ce client possède déjà un abonnement en cours. Attendez sa fin ou annulez-le avant d’en créer un autre.')] }]);
      return;
    }
    const plan = plans.find(p => p.id === values.plan_id);
    if (plansUnavailable || !plan || !isUuid(plan.id)) {
      form.setFields([{ name: 'plan_id', errors: [t('Veuillez sélectionner un plan enregistré dans la base de données')] }]);
      return;
    }

    const startDate = values.start_date;
    const endDate = startDate.add(plan.duration_days, 'day');

    onSubmit({
      customer_id: values.customer_id,
      plan_id: plan.id,
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      status: 'active',
    });
  };

  return (
    <Modal
      title={initialValues ? t("Modifier l'abonnement") : t("Ajouter un nouvel abonnement")}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okButtonProps={{ disabled: plansUnavailable || subscriptionsUnavailable }}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        title={t('Un seul abonnement en cours par client, même pour une période future.')}
        style={{ marginBottom: 16 }}
      />
      {subscriptionsError && (
        <Alert
          type="error"
          showIcon
          title={t('Impossible de vérifier les abonnements en cours')}
          description={subscriptionsError.message}
          action={<Button onClick={() => void refetchSubscriptions()}>{t("Réessayer")}</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      {plansError && (
        <Alert
          type="error"
          showIcon
          title={t("Impossible de charger les plans")}
          description={plansError.message}
          action={<Button onClick={() => void refetch()}>{t("Réessayer")}</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      {!plansLoading && !plansError && plans.length === 0 && (
        <Alert
          type="warning"
          showIcon
          title={t("Aucun plan disponible")}
          description={t("Créez un plan dans les paramètres avant d'ajouter un abonnement.")}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="customer_id"
          label={t("Sélectionner un client")}
          rules={[{ required: true, message: t("Veuillez sélectionner un client") }]}
        >
          <Select
            showSearch
            placeholder={t("Rechercher un client")}
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={customers.map(c => ({
              value: c.id,
              label: subscribedCustomers.has(c.id) ? `${c.full_name} - ${t('Abonnement en cours')}` : c.full_name,
              disabled: subscribedCustomers.has(c.id),
            }))}
            loading={subscriptionsFetching}
            disabled={!!initialValues || subscriptionsUnavailable}
          />
        </Form.Item>
        <Form.Item
          name="plan_id"
          label={t("Plan d'abonnement")}
          rules={[{ required: true, message: t("Veuillez sélectionner un plan") }]}
        >
          <Select
            placeholder={t("Sélectionner un plan")}
            loading={plansLoading}
            disabled={plansUnavailable}
            options={plans.map(p => ({
              value: p.id,
              label: `${translatePlanName(p.name, t)} (${p.duration_days.toLocaleString(numberLocale)} ${t("jours")} - ${formatPlanPrice(Number(p.price || 0))})`,
            }))}
          />
        </Form.Item>
        {selectedPlan && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {t("Durée:")}{' '}<strong>{selectedPlan.duration_days.toLocaleString(numberLocale)} {t("jours")}</strong> {t("| Prix:")}{' '}<strong>{formatPlanPrice(Number(selectedPlan.price || 0))}</strong>
            </div>
          </div>
        )}
        <Form.Item
          name="start_date"
          label={t("Date de début")}
          rules={[{ required: true, message: t("Veuillez sélectionner la date de début") }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>{t("Submit")}</button>
      </Form>
    </Modal>
  );
};

export default SubscriptionForm;
