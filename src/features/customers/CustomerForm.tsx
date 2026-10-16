import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { Customer, CustomerInput } from './types';
import { useTranslation } from 'react-i18next';

interface CustomerFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerInput) => void;
  initialValues?: Customer;
  loading?: boolean;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onCancel, onSubmit, initialValues, loading }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (initialValues) {
        form.setFieldsValue(initialValues);
      } else {
        form.resetFields();
      }
    }
  }, [open, initialValues, form]);

  const handleOk = () => {
    form.submit();
  };

  const handleFinish = (values: any) => {
    onSubmit(values as CustomerInput);
  };

  return (
    <Modal
      title={initialValues ? t("Modifier le visiteur") : t("Ajouter un nouveau visiteur")}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="full_name"
          label={t("Nom Complet")}
          rules={[{ required: true, message: t("Veuillez entrer le nom complet") }]}
        >
          <Input placeholder={t("John Doe")} />
        </Form.Item>
        <Form.Item
          name="email"
          label={t("Email")}
          rules={[
            { type: 'email', message: t("L'email n'est pas valide !") },
          ]}
        >
          <Input placeholder={t("john@example.com")} />
        </Form.Item>
        <Form.Item
          name="phone"
          label={t("Numéro de téléphone")}
        >
          <Input placeholder={t("+1 234 567 8900")} />
        </Form.Item>
        <Form.Item
          name="notes"
          label={t("Notes")}
        >
          <Input.TextArea rows={3} placeholder={t("Notes supplémentaires...")} />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>{t("Submit")}</button>
      </Form>
    </Modal>
  );
};

export default CustomerForm;
