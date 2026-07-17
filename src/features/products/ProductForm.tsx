import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal } from 'antd';
import type { Product, ProductInput } from './types';

interface ProductFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductInput) => void;
  initialValues?: Product;
  loading?: boolean;
}

const ProductForm: React.FC<ProductFormProps> = ({ open, onCancel, onSubmit, initialValues, loading }) => {
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
    onSubmit(values as ProductInput);
  };

  return (
    <Modal
      title={initialValues ? "Modifier le produit" : "Ajouter un nouveau produit"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Nom du produit"
          rules={[{ required: true, message: 'Veuillez entrer le nom du produit' }]}
        >
          <Input placeholder="Café, Jus, etc." />
        </Form.Item>
        <Form.Item
          name="description"
          label="Description"
        >
          <Input.TextArea rows={2} placeholder="Description optionnelle..." />
        </Form.Item>
        <Form.Item
          name="price"
          label="Prix (DT)"
          rules={[{ required: true, message: 'Veuillez entrer le prix' }]}
        >
          <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="stock"
          label="Stock Initial"
          rules={[{ required: true, message: 'Veuillez entrer la quantité en stock' }]}
          initialValue={0}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>Submit</button>
      </Form>
    </Modal>
  );
};

export default ProductForm;
