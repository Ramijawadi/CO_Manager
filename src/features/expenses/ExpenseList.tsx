import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';
import { toProductMillimes } from '../../lib/productMoney';
import { createExpense, deleteExpense, getExpenses, updateExpense } from './api';
import ExpenseForm from './ExpenseForm';
import { expenseCategories, formatExpenseAmount } from './types';
import type { Expense, ExpenseInput } from './types';
import { useTranslation } from 'react-i18next';
import { getNumberLocale } from '../../i18n';

export default function ExpenseList() {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();
  const { requireAdmin, isDemo } = usePermissions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>();
  const [open, setOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense>();
  const { data: expenses = [], isLoading, error, refetch } = useQuery({
    queryKey: ['expenses'], queryFn: getExpenses,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['financialReport'] });
  };
  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => { refresh(); setOpen(false); void messageApi.success(t('Frais ajouté avec succès')); },
    onError: (error: Error) => { void messageApi.error(error.message); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExpenseInput }) => updateExpense(id, data),
    onSuccess: () => { refresh(); setOpen(false); void messageApi.success(t('Frais mis à jour avec succès')); },
    onError: (error: Error) => { void messageApi.error(error.message); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => { refresh(); void messageApi.success(t('Frais supprimé')); },
    onError: (error: Error) => { void messageApi.error(error.message); },
  });
  const categories = [...new Set([...expenseCategories, ...expenses.map(expense => expense.category)])];
  const searchText = search.trim().toLowerCase();
  const filtered = expenses.filter(expense =>
    (!category || expense.category === category) &&
    [expense.name, expense.category, expense.notes ?? ''].some(value => value.toLowerCase().includes(searchText)));
  const total = filtered.reduce((sum, expense) => sum + toProductMillimes(expense.amount), 0) / 1000;
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleEdit = (expense?: Expense) => {
    if (!requireAdmin()) return;
    setEditingExpense(expense);
    setOpen(true);
  };
  const handleSubmit = (data: ExpenseInput) => {
    if (!requireAdmin() || saving) return;
    if (editingExpense) updateMutation.mutate({ id: editingExpense.id, data });
    else createMutation.mutate(data);
  };
  const handleDelete = (id: string) => {
    if (requireAdmin()) deleteMutation.mutate(id);
  };

  const columns: TableColumnsType<Expense> = [
    { title: t("Nom"), dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: t("Catégorie"), dataIndex: 'category', render: (value: string) => <Tag>{t(value)}</Tag> },
    { title: t("Date"), dataIndex: 'expense_date', render: (value: string) => dayjs(value).format('DD/MM/YYYY'),
      sorter: (a, b) => a.expense_date.localeCompare(b.expense_date) },
    { title: t("Montant"), dataIndex: 'amount', align: 'right', render: (amount: number) => formatExpenseAmount(amount, numberLocale),
      sorter: (a, b) => a.amount - b.amount },
    { title: t("Notes"), dataIndex: 'notes', ellipsis: true, render: (value?: string) => value || '-' },
    {
      title: t("Actions"), key: 'actions', width: 120,
      render: (_: unknown, expense: Expense) => (
        <Space>
          <AuthButton type="text" icon={<EditOutlined />} aria-label={`Modifier ${expense.name}`}
            onClick={() => handleEdit(expense)} />
          {isDemo ? (
            <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label={`Supprimer ${expense.name}`} />
          ) : (
            <Popconfirm title={t("Supprimer le frais")}
              description={t("Êtes-vous sûr de vouloir supprimer ce frais ?")}
              onConfirm={() => handleDelete(expense.id)} okText={t("Oui")} cancelText={t("Non")}>
              <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label={`Supprimer ${expense.name}`}
                disabled={deleteMutation.isPending}
                loading={deleteMutation.isPending && deleteMutation.variables === expense.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder={t("Rechercher des frais...")} prefix={<SearchOutlined />}
            aria-label={t("Rechercher des frais")} value={search} onChange={event => setSearch(event.target.value)}
            style={{ width: 280 }} allowClear />
          <Select placeholder={t("Toutes les catégories")} aria-label={t("Filtrer par catégorie")}
            value={category} onChange={setCategory} allowClear style={{ width: 220 }}
            options={categories.map(value => ({ label: t(value), value }))} />
        </Space>
        <AuthButton type="primary" icon={<PlusOutlined />} onClick={() => handleEdit()}>
          {t("Nouveau frais")}{' '}</AuthButton>
      </div>
      {error && (
        <Alert type="error" showIcon title={t("Impossible de charger les frais")} description={error.message}
          action={<Button onClick={() => { void refetch(); }}>{t("Réessayer")}</Button>}
          style={{ marginBottom: 16 }} />
      )}
      <Table<Expense>
        columns={columns} dataSource={filtered} rowKey="id" loading={isLoading} scroll={{ x: 850 }}
        pagination={{ defaultPageSize: 5, showSizeChanger: true,
          showTotal: count => t('Total : {{count}} frais', { count }) }}
        footer={() => (
          <Typography.Text strong>
            {t("Total des frais affichés :")}{' '}{formatExpenseAmount(total, numberLocale)}
          </Typography.Text>
        )}
      />
      <ExpenseForm open={open} onCancel={() => { if (!saving) setOpen(false); }}
        onSubmit={handleSubmit} initialValues={editingExpense} categories={categories} loading={saving} />
    </div>
  );
}
