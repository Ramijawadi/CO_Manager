import React, { useState } from 'react';
import { Table, Input, Space, Popconfirm, message } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts, createProduct, updateProduct, deleteProduct } from './api';
import ProductForm from './ProductForm';
import type { Product, ProductInput } from './types';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';

const ProductList: React.FC = () => {
  const queryClient = useQueryClient();
  const { requireAdmin, isDemo } = usePermissions();
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('Produit ajouté avec succès');
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductInput }) => updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('Produit mis à jour avec succès');
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('Produit supprimé');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchText.toLowerCase()) || 
    (p.description || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const handleAdd = () => {
    if (!requireAdmin()) return;
    setEditingProduct(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    if (!requireAdmin()) return;
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (values: ProductInput) => {
    if (!requireAdmin()) return;
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns = [
    { title: 'Nom', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Prix', dataIndex: 'price', key: 'price', render: (val: number) => val % 1 === 0 ? `${val}dt` : `${Math.floor(val)}dt.${String(Math.round((val % 1) * 1000)).padStart(3, '0')}` },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Product) => (
        <Space size="middle">
          <AuthButton type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {isDemo ? (
            <AuthButton type="text" danger icon={<DeleteOutlined />} />
          ) : (
            <Popconfirm
              title="Supprimer le produit"
              description="Êtes-vous sûr de vouloir supprimer ce produit ?"
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="Oui"
              cancelText="Non"
            >
              <AuthButton type="text" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === record.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingTop: 20 }}>
        <Input
          placeholder="Rechercher des produits..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Nouveau produit
        </AuthButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={filteredProducts}
          rowKey="id"
          loading={isLoading}
          pagination={{ defaultPageSize: 10, size: 'small' }}
          style={{ height: '100%' }}
          scroll={{ y: 'calc(100vh - 300px)' }}
        />
      </div>

      <ProductForm
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialValues={editingProduct}
        loading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
};

export default ProductList;
