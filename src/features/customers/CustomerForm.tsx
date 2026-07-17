import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { Customer, CustomerInput } from './types';

interface CustomerFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerInput) => void;
  initialValues?: Customer;
  loading?: boolean;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onCancel, onSubmit, initialValues, loading }) => {
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
      title={initialValues ? "Modifier le visiteur" : "Ajouter un nouveau visiteur"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="full_name"
          label="Nom Complet"
          rules={[{ required: true, message: 'Veuillez entrer le nom complet' }]}
        >
          <Input placeholder="John Doe" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { type: 'email', message: "L'email n'est pas valide !" },
          ]}
        >
          <Input placeholder="john@example.com" />
        </Form.Item>
        <Form.Item
          name="phone"
          label="Numéro de téléphone"
        >
          <Input placeholder="+1 234 567 8900" />
        </Form.Item>
        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea rows={3} placeholder="Notes supplémentaires..." />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>Submit</button>
      </Form>
    </Modal>
  );
};

export default CustomerForm;
