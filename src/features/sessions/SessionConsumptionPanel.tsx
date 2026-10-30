import React, { useState } from 'react';
import { Table, Modal, Form, Select, InputNumber, message, Popconfirm, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts } from '../products/api';
import { addSessionProduct, removeSessionProduct } from './api';
import type { Session, SessionProduct } from './types';
import type { Product } from '../products/types';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';
import { formatProductPrice } from '../../lib/productMoney';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface Props {
  session: Session;
  onClose?: () => void;
}

interface ProductSelectionValues {
  product_ids: string[];
  quantities: Record<string, number>;
}

class ProductBatchError extends Error {
  readonly addedProductIds: string[];

  constructor(addedProductIds: string[], cause: Error) {
    super(cause.message);
    this.name = 'ProductBatchError';
    this.addedProductIds = addedProductIds;
  }
}

const SessionConsumptionPanel: React.FC<Props> = ({ session, onClose }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { requireWrite, isReadOnly, deniedMessage } = usePermissions(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  
  const selectedProductIds: string[] = Form.useWatch('product_ids', form) ?? [];
  const quantities: Record<string, number> = Form.useWatch('quantities', form) ?? {};

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const addMutation = useMutation({
    mutationFn: async (values: ProductSelectionValues) => {
      const addedProductIds: string[] = [];
      for (const productId of values.product_ids) {
        const product = products.find(item => item.id === productId);
        const quantity = values.quantities[productId];

        try {
          if (!product || !quantity) {
            throw new Error(t("Veuillez sélectionner un produit"));
          }
          await addSessionProduct(session.id, productId, quantity, product.price * quantity);
          addedProductIds.push(productId);
        } catch (error) {
          if (error instanceof Error) {
            throw new ProductBatchError(addedProductIds, error);
          }
          throw error;
        }
      }
      return addedProductIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success(t("Produits ajoutés à la session"));
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (error: Error) => {
      if (error instanceof ProductBatchError && error.addedProductIds.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
        const remainingProductIds = selectedProductIds.filter(id => !error.addedProductIds.includes(id));
        form.setFieldsValue({ product_ids: remainingProductIds });
        message.error(t("Certains produits n'ont pas pu être ajoutés. Les produits ajoutés ont été retirés de la sélection."));
        return;
      }
      message.error(error.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeSessionProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success(t("Produit retiré"));
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleOk = () => {
    if (!requireWrite()) return;
    form.submit();
  };

  const handleFinish = (values: ProductSelectionValues) => {
    if (!requireWrite()) return;
    addMutation.mutate(values);
  };

  const columns = [
    {
      title: t("Produit"),
      dataIndex: ['products', 'name'],
      key: 'name',
      width: '45%',
    },
    {
      title: t("Quantité"),
      dataIndex: 'quantity',
      key: 'quantity',
      width: '20%',
      align: 'center' as const,
    },
    {
      title: t("Prix Total"),
      dataIndex: 'total_price',
      key: 'total_price',
      width: '25%',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ color: '#059669' }}>
          {formatProductPrice(val, i18n.resolvedLanguage)}
        </Text>
      ),
    },
    {
      title: t(""),
      key: 'action',
      width: '10%',
      align: 'center' as const,
      render: (_: unknown, record: SessionProduct) => (
        isReadOnly ? (
          <AuthButton employeeOnly type="text" danger icon={<DeleteOutlined />} />
        ) : (
          <Popconfirm
            title={t("Retirer le produit")}
            onConfirm={() => { if (requireWrite()) removeMutation.mutate(record.id); }}
            okText={t("Oui")}
            cancelText={t("Non")}
          >
            <AuthButton employeeOnly type="text" danger icon={<DeleteOutlined />} loading={removeMutation.isPending && removeMutation.variables === record.id} />
          </Popconfirm>
        )
      ),
    },
  ];

  const totalConsumption = (session.session_products || []).reduce((acc, curr) => acc + curr.total_price, 0);

  return (
    <div style={{ 
      padding: '24px 32px', 
      background: '#ffffff', 
      border: '1px solid #e5e7eb', 
      borderRadius: 8,
      margin: '8px 0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <Text strong style={{ fontSize: '15px', color: '#0f172a' }}>
          {t("Produits Consommés (Total :")}{' '}{formatProductPrice(totalConsumption, i18n.resolvedLanguage)}{t(")")}{' '}</Text>
        <AuthButton employeeOnly type="primary" icon={<PlusOutlined />} onClick={() => {
          if (!requireWrite()) return;
          setIsModalOpen(true);
        }}>
          {t("Ajouter un produit")}{' '}</AuthButton>
      </div>

      <Table
        dataSource={session.session_products || []}
        columns={columns}
        rowKey="id"
        scroll={{ x: 520, y: 240 }}
        pagination={{ 
          defaultPageSize: 5, 
          showSizeChanger: false,
          showTotal: total => total === 1
            ? t('Total : 1 produit')
            : t('Total : {{count}} produits', { count: total }),
          style: { marginTop: '16px' }
        }}
      />

      <Modal
        title={t("Ajouter un produit à la session")}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          onClose?.();
        }}
        onOk={handleOk}
        confirmLoading={addMutation.isPending}
        okButtonProps={{ disabled: isReadOnly, title: isReadOnly ? deniedMessage : undefined }}
        width={520}
      >
        <Form 
          form={form} 
          layout="vertical" 
          initialValues={{ product_ids: [], quantities: {} }} 
          onFinish={handleFinish}
          style={{ padding: '20px 0' }}
        >
          <Form.Item
            name="product_ids"
            label={t("Sélectionner un produit")}
            rules={[{ required: true, message: t("Veuillez sélectionner un produit") }]}
          >
            <Select
              mode="multiple"
              showSearch
              placeholder={t("Rechercher un produit")}
              optionFilterProp="children"
              size="large"
              maxTagCount="responsive"
              onChange={(productIds: string[]) => {
                const nextQuantities = { ...form.getFieldValue('quantities') };
                productIds.forEach(productId => {
                  if (nextQuantities[productId] === undefined) nextQuantities[productId] = 1;
                });
                form.setFieldsValue({ quantities: nextQuantities });
              }}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={products.map((p: Product) => ({ 
                value: p.id, 
                label: `${p.name} - ${formatProductPrice(p.price, i18n.resolvedLanguage)}`
              }))}
            />
          </Form.Item>
          {selectedProductIds.map(productId => {
            const product = products.find(item => item.id === productId);
            if (!product) return null;
            const quantity = quantities[productId] ?? 1;
            return (
              <div key={productId} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <Text style={{ flex: 1 }}>{product.name}</Text>
                <Form.Item
                  name={['quantities', productId]}
                  label={t("Quantité")}
                  initialValue={1}
                  rules={[{ required: true, type: 'number', min: 1, message: t("Veuillez spécifier la quantité") }]}
                  style={{ width: 110, marginBottom: 0 }}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Text strong style={{ minWidth: 100, textAlign: 'right', color: '#059669' }}>
                  {formatProductPrice(product.price * quantity, i18n.resolvedLanguage)}
                </Text>
              </div>
            );
          })}
          {selectedProductIds.length > 0 && (
            <div style={{
              marginTop: 16,
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: 6,
              textAlign: 'right'
            }}>
              <Text strong style={{ fontSize: '16px', color: '#0f172a' }}>
                {t("Total:")}{' '}{formatProductPrice(
                  selectedProductIds.reduce((total, productId) => {
                    const product = products.find(item => item.id === productId);
                    return total + (product ? product.price * (quantities[productId] ?? 1) : 0);
                  }, 0),
                  i18n.resolvedLanguage
                )}
              </Text>
            </div>
          )}
          <button type="submit" style={{ display: 'none' }}>{t("Submit")}</button>
        </Form>
      </Modal>
    </div>
  );
};

export default SessionConsumptionPanel;
