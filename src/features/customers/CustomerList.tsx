import React, { useState, useMemo } from 'react';
import { Table, Input, Space, Popconfirm, message } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from './api';
import CustomerForm from './CustomerForm';
import type { Customer, CustomerInput } from './types';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';

const CustomerList: React.FC = () => {
  const queryClient = useQueryClient();
  const { isDemo, requireAdmin } = usePermissions();
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>();

  // Fetch data
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Visiteur créé avec succès');
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & CustomerInput) => updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Visiteur mis à jour avec succès');
      setIsModalOpen(false);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Visiteur supprimé avec succès');
    },
    onError: (error: Error) => message.error(error.message),
  });

  // Derived state
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchText = (customer.full_name || '') + ' ' + (customer.email || '') + ' ' + (customer.phone || '');
      return matchText.toLowerCase().includes(searchText.toLowerCase());
    });
  }, [customers, searchText]);

  // Handlers
  const handleAdd = () => {
    if (!requireAdmin()) return;
    setEditingCustomer(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    if (!requireAdmin()) return;
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!requireAdmin()) return;
    deleteMutation.mutate(id);
  };

  const handleModalSubmit = (values: CustomerInput) => {
    if (!requireAdmin()) return;
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  };

  // Table Columns
  const columns = [
    {
      title: 'Nom Complet',
      dataIndex: 'full_name',
      key: 'full_name',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Téléphone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (text: string) => (
        <span style={{ color: text ? '#64748b' : '#cbd5e1' }}>
          {text || '—'}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Customer) => (
        <Space size="middle">
          <AuthButton 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          />
          {isDemo ? (
            <AuthButton type="text" danger icon={<DeleteOutlined />} />
          ) : (
            <Popconfirm
              title="Supprimer le visiteur"
              description="Êtes-vous sûr de vouloir supprimer ce visiteur ?"
              onConfirm={() => handleDelete(record.id)}
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
          placeholder="Rechercher des visiteurs..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Nouveau visiteur
        </AuthButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={filteredCustomers}
          rowKey="id"
          loading={isLoading}
          pagination={{ defaultPageSize: 10, size: 'small' }}
          style={{ height: '100%' }}
          scroll={{ y: 'calc(100vh - 300px)' }}
        />
      </div>

      <CustomerForm
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialValues={editingCustomer}
        loading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
};

export default CustomerList;
