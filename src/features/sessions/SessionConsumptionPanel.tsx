import React, { useState } from 'react';
import { Table, Button, Modal, Form, Select, InputNumber, message, Popconfirm, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts } from '../products/api';
import { addSessionProduct, removeSessionProduct } from './api';
import type { Session, SessionProduct } from './types';
import type { Product } from '../products/types';

const { Text } = Typography;

interface Props {
  session: Session;
}

const SessionConsumptionPanel: React.FC<Props> = ({ session }) => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  
  // Watch product_id to get price dynamically
  const selectedProductId = Form.useWatch('product_id', form);

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
    form.submit();
  };

  const handleFinish = (values: any) => {
    if (!selectedProduct) return;
    const total_price = selectedProduct.price * values.quantity;
    addMutation.mutate({ ...values, total_price });
  };

  const columns = [
    {
      title: 'Produit',
      dataIndex: ['products', 'name'],
      key: 'name',
    },
    {
      title: 'Quantité',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: 'Prix Total',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (val: number) => `${val.toFixed(2)} DT`,
    },
    {
      title: '',
      key: 'action',
      render: (_: any, record: SessionProduct) => (
        <Popconfirm
          title="Retirer le produit"
          onConfirm={() => removeMutation.mutate(record.id)}
          okText="Oui"
          cancelText="Non"
        >
          <Button type="text" danger icon={<DeleteOutlined />} loading={removeMutation.isPending && removeMutation.variables === record.id} />
        </Popconfirm>
      ),
    },
  ];

  const totalConsumption = (session.session_products || []).reduce((acc, curr) => acc + curr.total_price, 0);

  return (
    <div style={{ padding: '0 24px 16px 24px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
        <Text strong>Produits Consommés (Total : {totalConsumption.toFixed(2)} DT)</Text>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          Ajouter un produit
        </Button>
      </div>

      <Table
        dataSource={session.session_products || []}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
      />

      <Modal
        title="Ajouter un produit à la session"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        onOk={handleOk}
        confirmLoading={addMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ quantity: 1 }} onFinish={handleFinish}>
          <Form.Item
            name="product_id"
            label="Sélectionner un produit"
            rules={[{ required: true, message: 'Veuillez sélectionner un produit' }]}
          >
            <Select
              showSearch
              placeholder="Rechercher un produit"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={products.map((p: Product) => ({ 
                value: p.id, 
                label: `${p.name} - ${p.price.toFixed(2)} DT` 
              }))}
            />
          </Form.Item>
          
          <Form.Item
            name="quantity"
            label="Quantité"
            rules={[{ required: true, message: 'Veuillez spécifier la quantité' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          {selectedProduct && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Text type="secondary">
                Total: {(selectedProduct.price * (form.getFieldValue('quantity') || 1)).toFixed(2)} DT
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
