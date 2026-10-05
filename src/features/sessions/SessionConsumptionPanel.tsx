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

const { Text } = Typography;

interface Props {
  session: Session;
  onClose?: () => void;
}

const SessionConsumptionPanel: React.FC<Props> = ({ session, onClose }) => {
  const queryClient = useQueryClient();
  const { requireAdmin, isDemo } = usePermissions();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  
  // Watch product_id to get price dynamically
  const selectedProductId = Form.useWatch('product_id', form);
  const quantity = Form.useWatch('quantity', form) ?? 1;

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const addMutation = useMutation({
    mutationFn: (values: any) => addSessionProduct(session.id, values.product_id, values.quantity, values.total_price),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success('Produit ajouté à la session');
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (error: Error) => message.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: removeSessionProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      message.success('Produit retiré');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const handleOk = () => {
    if (!requireAdmin()) return;
    form.submit();
  };

  const handleFinish = (values: any) => {
    if (!requireAdmin()) return;
    if (!selectedProduct) return;
    const total_price = selectedProduct.price * values.quantity;
    addMutation.mutate({ ...values, total_price });
  };

  const columns = [
    {
      title: 'Produit',
      dataIndex: ['products', 'name'],
      key: 'name',
      width: '45%',
    },
    {
      title: 'Quantité',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '20%',
      align: 'center' as const,
    },
    {
      title: 'Prix Total',
      dataIndex: 'total_price',
      key: 'total_price',
      width: '25%',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ color: '#059669' }}>
          {formatProductPrice(val)}
        </Text>
      ),
    },
    {
      title: '',
      key: 'action',
      width: '10%',
      align: 'center' as const,
      render: (_: any, record: SessionProduct) => (
        isDemo ? (
          <AuthButton type="text" danger icon={<DeleteOutlined />} />
        ) : (
          <Popconfirm
            title="Retirer le produit"
            onConfirm={() => removeMutation.mutate(record.id)}
            okText="Oui"
            cancelText="Non"
          >
            <AuthButton type="text" danger icon={<DeleteOutlined />} loading={removeMutation.isPending && removeMutation.variables === record.id} />
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
          Produits Consommés (Total : {formatProductPrice(totalConsumption)})
        </Text>
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => {
          if (!requireAdmin()) return;
          setIsModalOpen(true);
        }}>
          Ajouter un produit
        </AuthButton>
      </div>

      <Table
        dataSource={session.session_products || []}
        columns={columns}
        rowKey="id"
        pagination={{ 
          defaultPageSize: 5, 
          showTotal: (total) => `Total: ${total} produit${total > 1 ? 's' : ''}`,
          style: { marginTop: '16px' }
        }}
      />

      <Modal
        title="Ajouter un produit à la session"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          onClose?.();
        }}
        onOk={handleOk}
        confirmLoading={addMutation.isPending}
        okButtonProps={{ disabled: isDemo, title: isDemo ? 'Available for administrators only.' : undefined }}
        width={520}
      >
        <Form 
          form={form} 
          layout="vertical" 
          initialValues={{ quantity: 1 }} 
          onFinish={handleFinish}
          style={{ padding: '20px 0' }}
        >
          <Form.Item
            name="product_id"
            label="Sélectionner un produit"
            rules={[{ required: true, message: 'Veuillez sélectionner un produit' }]}
          >
            <Select
              showSearch
              placeholder="Rechercher un produit"
              optionFilterProp="children"
              size="large"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={products.map((p: Product) => ({ 
                value: p.id, 
                label: `${p.name} - ${formatProductPrice(p.price)}`
              }))}
            />
          </Form.Item>
          
          <Form.Item
            name="quantity"
            label="Quantité"
            rules={[{ required: true, message: 'Veuillez spécifier la quantité' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} size="large" />
          </Form.Item>

          {selectedProduct && (
            <div style={{ 
              marginTop: 16, 
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: 6,
              textAlign: 'right'
            }}>
              <Text strong style={{ fontSize: '16px', color: '#0f172a' }}>
                Total: {formatProductPrice(selectedProduct.price * quantity)}
              </Text>
            </div>
          )}
          <button type="submit" style={{ display: 'none' }}>Submit</button>
        </Form>
      </Modal>
    </div>
  );
};

export default SessionConsumptionPanel;
