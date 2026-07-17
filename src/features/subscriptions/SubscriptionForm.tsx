import React, { useEffect } from 'react';
import { Form, Modal, Select, DatePicker } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getPlans } from '../plans/api';
import type { SubscriptionInput, Subscription } from './types';
import type { Customer } from '../customers/types';
import dayjs from 'dayjs';

interface SubscriptionFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: SubscriptionInput) => void;
  customers: Customer[];
  initialValues?: Subscription;
  loading?: boolean;
}

const SubscriptionForm: React.FC<SubscriptionFormProps> = ({ open, onCancel, onSubmit, customers, initialValues, loading }) => {
  const [form] = Form.useForm();
  const selectedPlanId = Form.useWatch('plan_id', form);

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  });

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  useEffect(() => {
    if (open) {
      if (initialValues) {
        form.setFieldsValue({
          ...initialValues,
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

  const handleFinish = (values: any) => {
    const plan = plans.find(p => p.id === values.plan_id);
    if (!plan) return;

    const startDate = values.start_date as dayjs.Dayjs;
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
      title={initialValues ? "Modifier l'abonnement" : "Ajouter un nouvel abonnement"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
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
            disabled={!!initialValues}
          />
        </Form.Item>
        <Form.Item
          name="plan_id"
          label="Plan d'abonnement"
          rules={[{ required: true, message: 'Veuillez sélectionner un plan' }]}
        >
          <Select
            placeholder="Sélectionner un plan"
            options={plans.map(p => ({
              value: p.id,
              label: `${p.name} (${p.duration_days} jours - ${p.price} DT)`,
            }))}
          />
        </Form.Item>
        {selectedPlan && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Durée: <strong>{selectedPlan.duration_days} jours</strong> | Prix: <strong>{selectedPlan.price} DT</strong>
            </div>
          </div>
        )}
        <Form.Item
          name="start_date"
          label="Date de début"
          rules={[{ required: true, message: 'Veuillez sélectionner la date de début' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>Submit</button>
      </Form>
    </Modal>
  );
};

export default SubscriptionForm;
