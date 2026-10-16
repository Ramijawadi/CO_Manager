import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal } from 'antd';
import type { Product, ProductInput } from './types';
import { useTranslation } from 'react-i18next';

interface ProductFormProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductInput) => void;
  initialValues?: Product;
  loading?: boolean;
}

const ProductForm: React.FC<ProductFormProps> = ({ open, onCancel, onSubmit, initialValues, loading }) => {
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
    onSubmit(values as ProductInput);
  };

  return (
    <Modal
      title={initialValues ? t("Modifier le produit") : t("Ajouter un nouveau produit")}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label={t("Nom du produit")}
          rules={[{ required: true, message: t("Veuillez entrer le nom du produit") }]}
        >
          <Input placeholder={t("Café, Jus, etc.")} />
        </Form.Item>
        <Form.Item
          name="description"
          label={t("Description")}
        >
          <Input.TextArea rows={2} placeholder={t("Description optionnelle...")} />
        </Form.Item>
        <Form.Item
          name="price"
          label={t("Prix (DT)")}
          rules={[{ required: true, message: t("Veuillez entrer le prix") }]}
        >
          <InputNumber min={0} step={0.001} precision={3} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="stock"
          label={t("Stock Initial")}
          rules={[{ required: true, message: t("Veuillez entrer la quantité en stock") }]}
          initialValue={0}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <button type="submit" style={{ display: 'none' }}>{t("Submit")}</button>
      </Form>
    </Modal>
  );
};

export default ProductForm;
