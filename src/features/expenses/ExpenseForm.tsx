import { useEffect } from 'react';
import { AutoComplete, DatePicker, Form, Input, InputNumber, Modal } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Expense, ExpenseInput } from './types';

type FormValues = Omit<ExpenseInput, 'expense_date'> & { expense_date: Dayjs };

interface ExpenseFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: ExpenseInput) => void;
  initialValues?: Expense;
  categories: string[];
  loading: boolean;
}

export default function ExpenseForm({
  open, onCancel, onSubmit, initialValues, categories, loading,
}: ExpenseFormProps) {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initialValues ? {
      name: initialValues.name, category: initialValues.category,
      amount: initialValues.amount, notes: initialValues.notes ?? '',
      expense_date: dayjs(initialValues.expense_date),
    } : { expense_date: dayjs(), notes: '' });
  }, [open, initialValues, form]);

  const finish = (values: FormValues) => onSubmit({
    ...values, name: values.name.trim(), category: values.category.trim(),
    expense_date: values.expense_date.format('YYYY-MM-DD'),
    notes: values.notes?.trim() ?? '',
  });

  return (
    <Modal
      title={initialValues ? 'Modifier le frais' : 'Ajouter un nouveau frais'}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={initialValues ? 'Enregistrer' : 'Ajouter'}
      cancelText="Annuler"
      confirmLoading={loading}
      cancelButtonProps={{ disabled: loading }}
      closable={!loading}
      mask={{ closable: !loading }}
      keyboard={!loading}
    >
      <Form form={form} layout="vertical" onFinish={finish} disabled={loading}>
        <Form.Item name="name" label="Nom du frais"
          rules={[{ required: true, whitespace: true, message: 'Veuillez entrer le nom du frais' }]}>
          <Input maxLength={200} placeholder="Facture internet, réparation, etc." />
        </Form.Item>
        <Form.Item name="category" label="Catégorie"
          rules={[{ required: true, whitespace: true, message: 'Veuillez entrer une catégorie' },
            { max: 200, message: 'La catégorie ne peut pas dépasser 200 caractères' }]}>
          <AutoComplete
            options={categories.map(value => ({ value }))}
            filterOption={false}
            allowClear
            placeholder="Internet, Électricité, Eau ou votre propre catégorie"
          />
        </Form.Item>
        <Form.Item name="amount" label="Montant (DT)"
          rules={[{ required: true, message: 'Veuillez entrer le montant' },
            { type: 'number', min: 0.001, max: 1_000_000_000, message: 'Le montant doit être compris entre 0,001 et 1 000 000 000 DT' }]}>
          <InputNumber min={0.001} max={1_000_000_000} step={0.001} precision={3} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="expense_date" label="Date du frais"
          rules={[{ required: true, message: 'Veuillez choisir la date du frais' }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} maxLength={10000} placeholder="Notes optionnelles..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
