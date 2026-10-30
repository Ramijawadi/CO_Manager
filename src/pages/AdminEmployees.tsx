import React, { useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert, Button, Card, DatePicker, Descriptions, Input, Modal, Pagination, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeWorkSession, getEmployees, getWorkSessions, updateEmployeeStatus,
  type EmployeeAccount,
} from '../features/employee/adminApi';
import type { WorkSession } from '../features/employee/api';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '../i18n';

const { Text } = Typography;

type PendingAction =
  | { type: 'employee'; employee: EmployeeAccount; status: string }
  | { type: 'shift'; shift: WorkSession };

const accountStatus = (employee: EmployeeAccount) => employee.status ?? 'active';
const statusLabel = (status: string) => ({
  pending: 'En attente',
  active: 'Actif',
  rejected: 'Rejeté',
  disabled: 'Désactivé',
  completed: 'Terminé',
}[status] ?? status);
const statusColor = (status: string) => ({
  pending: 'gold', active: 'green', rejected: 'red', disabled: 'default',
}[status] ?? 'default');

const AdminEmployees: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.resolvedLanguage);
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(locale) : '—';
  const queryClient = useQueryClient();
  const [employeePage, setEmployeePage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);
  const [search, setSearch] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState('');
  const [shiftStatus, setShiftStatus] = useState('');
  const [shiftStartDate, setShiftStartDate] = useState('');
  const [shiftEndDate, setShiftEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeAccount | null>(null);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');

  const employees = useQuery({
    queryKey: ['adminEmployees', employeePage, search, employeeStatus],
    queryFn: () => getEmployees(employeePage, search, employeeStatus),
  });
  const shifts = useQuery({
    queryKey: ['adminWorkSessions', shiftPage, shiftStatus, selectedEmployee?.id, shiftStartDate, shiftEndDate],
    queryFn: () => getWorkSessions(
      shiftPage, shiftStatus, selectedEmployee?.id, shiftStartDate, shiftEndDate,
    ),
  });
  const detailShift = shifts.data?.items.find(shift => shift.id === detailShiftId);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['adminEmployees'] }),
      queryClient.invalidateQueries({ queryKey: ['adminWorkSessions'] }),
    ]);
  };
  const updateStatus = useMutation({
    mutationFn: ({ employee, status, reason: actionReason }: {
      employee: EmployeeAccount; status: string; reason: string;
    }) => updateEmployeeStatus(employee.id, status, actionReason),
    onSuccess: async () => {
      message.success(t('État du compte mis à jour'));
      setAction(null);
      setReason('');
      await refresh();
    },
    onError: error => message.error(error.message),
  });
  const closeShift = useMutation({
    mutationFn: ({ shift, reason: actionReason }: { shift: WorkSession; reason: string }) =>
      closeWorkSession(shift.id, actionReason),
    onSuccess: async () => {
      message.success(t('Service clôturé et audité'));
      setAction(null);
      setReason('');
      await refresh();
    },
    onError: error => message.error(error.message),
  });

  const employeeColumns: ColumnsType<EmployeeAccount> = [
    {
      title: t('Employé'),
      key: 'name',
      render: (_, employee) => (
        <Space direction="vertical" size={0}>
          <Text strong>{employee.full_name || employee.email}</Text>
          <Text type="secondary">{employee.email}</Text>
        </Space>
      ),
    },
    { title: t('Numéro de téléphone'), dataIndex: 'phone', key: 'phone', render: value => value || '—' },
    {
      title: t('État'),
      key: 'status',
      render: (_, employee) => {
        const status = accountStatus(employee);
        return <Tag color={statusColor(status)}>{t(statusLabel(status))}</Tag>;
      },
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, employee) => {
        const status = accountStatus(employee);
        const nextStatus = status === 'pending' ? 'active' : status === 'active' ? 'disabled' : 'active';
        const label = status === 'pending' ? t('Approuver')
          : status === 'active' ? t('Désactiver') : t('Activer');
        return (
          <Space wrap>
            <Button size="small" onClick={() => {
              setSelectedEmployee(employee);
              setShiftPage(1);
              setShiftStatus('');
              setShiftStartDate('');
              setShiftEndDate('');
            }}>
              {t('Voir les services')}
            </Button>
            <Button
              size="small"
              danger={nextStatus === 'disabled'}
              onClick={() => setAction({ type: 'employee', employee, status: nextStatus })}
            >
              {label}
            </Button>
            {status === 'pending' && (
              <Button
                size="small"
                danger
                onClick={() => setAction({ type: 'employee', employee, status: 'rejected' })}
              >
                {t('Rejeter')}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const shiftColumns: ColumnsType<WorkSession> = [
    {
      title: t('Employé'),
      key: 'employee',
      render: (_, shift) => shift.employee?.full_name || shift.employee?.email || shift.employee_id,
    },
    {
      title: t('Début du service'),
      dataIndex: 'start_time',
      key: 'start_time',
      render: formatDate,
    },
    {
      title: t('Fin du service'),
      dataIndex: 'end_time',
      key: 'end_time',
      render: formatDate,
    },
    {
      title: t('Durée'),
      dataIndex: 'duration_minutes',
      key: 'duration',
      render: (value: number | null) => value === null ? t('En cours') : `${value} ${t('minutes')}`,
    },
    {
      title: t('État'),
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={value === 'active' ? 'green' : 'default'}>{t(statusLabel(value))}</Tag>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, shift) => (
        <Space wrap>
          <Button size="small" onClick={() => setDetailShiftId(shift.id)}>{t('Détails')}</Button>
          {shift.status === 'active' && (
            <Button size="small" danger onClick={() => setAction({ type: 'shift', shift })}>
              {t('Clôturer le service')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const submitAction = () => {
    if (!reason.trim()) return;
    if (action?.type === 'employee') {
      updateStatus.mutate({ employee: action.employee, status: action.status, reason: reason.trim() });
    } else if (action?.type === 'shift') {
      closeShift.mutate({ shift: action.shift, reason: reason.trim() });
    }
  };
  const actionLoading = updateStatus.isPending || closeShift.isPending;
  const actionTitle = action?.type === 'employee'
    ? `${t('Modifier l’état de')} ${action.employee.full_name || action.employee.email}`
    : t('Clôturer le service');

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 20 }}>
      <Card title={t('Comptes employés')} style={{ marginBottom: 18 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder={t('Rechercher un employé par nom ou email')}
            value={search}
            onChange={event => { setSearch(event.target.value); setEmployeePage(1); }}
            style={{ width: 300, maxWidth: '80vw' }}
          />
          <Select
            allowClear
            placeholder={t('Tous les états')}
            value={employeeStatus || undefined}
            onChange={value => { setEmployeeStatus(value || ''); setEmployeePage(1); }}
            options={['pending', 'active', 'rejected', 'disabled'].map(status => ({
              value: status, label: t(statusLabel(status)),
            }))}
            style={{ width: 180 }}
          />
          {selectedEmployee && (
            <Button onClick={() => { setSelectedEmployee(null); setShiftPage(1); }}>
              {t('Afficher tous les services')}
            </Button>
          )}
        </Space>
        {employees.isError && (
          <Alert type="error" showIcon message={employees.error.message} style={{ marginBottom: 16 }} />
        )}
        <Table
          rowKey="id"
          columns={employeeColumns}
          dataSource={employees.data?.items ?? []}
          loading={employees.isLoading}
          pagination={false}
          scroll={{ x: 800 }}
          locale={{ emptyText: t('Aucun employé trouvé') }}
          onRow={employee => ({
            onDoubleClick: () => { setSelectedEmployee(employee); setShiftPage(1); },
          })}
        />
        <Pagination
          current={employeePage}
          pageSize={20}
          total={employees.data?.total ?? 0}
          onChange={setEmployeePage}
          showSizeChanger={false}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      <Card title={selectedEmployee
        ? `${t('Services de')} ${selectedEmployee.full_name || selectedEmployee.email}`
        : t('Services employés')}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            value={shiftStatus || undefined}
            allowClear
            placeholder={t('Tous les états')}
            onChange={value => { setShiftStatus(value || ''); setShiftPage(1); }}
            options={['active', 'completed'].map(status => ({
              value: status, label: t(statusLabel(status)),
            }))}
            style={{ width: 180 }}
          />
          <DatePicker.RangePicker
            value={shiftStartDate && shiftEndDate ? [dayjs(shiftStartDate), dayjs(shiftEndDate)] : null}
            onChange={range => {
              setShiftStartDate(range?.[0]?.format('YYYY-MM-DD') ?? '');
              setShiftEndDate(range?.[1]?.format('YYYY-MM-DD') ?? '');
              setShiftPage(1);
            }}
          />
          {selectedEmployee && <Text type="secondary">{selectedEmployee.email}</Text>}
        </Space>
        {shifts.isError && (
          <Alert type="error" showIcon message={shifts.error.message} style={{ marginBottom: 16 }} />
        )}
        <Table
          rowKey="id"
          columns={shiftColumns}
          dataSource={shifts.data?.items ?? []}
          loading={shifts.isLoading}
          pagination={false}
          scroll={{ x: 800 }}
          locale={{ emptyText: t('Aucun service trouvé') }}
        />
        <Pagination
          current={shiftPage}
          pageSize={20}
          total={shifts.data?.total ?? 0}
          onChange={setShiftPage}
          showSizeChanger={false}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      <Modal
        title={t('Détails du service')}
        open={!!detailShift}
        onCancel={() => setDetailShiftId(null)}
        footer={<Button onClick={() => setDetailShiftId(null)}>{t('Fermer')}</Button>}
      >
        {detailShift && (
          <Descriptions column={1} bordered size="small" items={[
            { key: 'employee', label: t('Employé'), children: detailShift.employee?.full_name || detailShift.employee?.email || detailShift.employee_id },
            { key: 'email', label: t('Email'), children: detailShift.employee?.email || '—' },
            { key: 'start', label: t('Début du service'), children: formatDate(detailShift.start_time) },
            { key: 'end', label: t('Fin du service'), children: formatDate(detailShift.end_time) },
            { key: 'duration', label: t('Durée'), children: detailShift.duration_minutes === null ? t('En cours') : `${detailShift.duration_minutes} ${t('minutes')}` },
            { key: 'status', label: t('État'), children: t(statusLabel(detailShift.status)) },
            { key: 'created', label: t('Date de création'), children: formatDate(detailShift.created_at) },
            { key: 'closure', label: t('Clôture administrative'), children: t(detailShift.closed_by ? 'Oui' : 'Non') },
            ...(detailShift.closed_by ? [
              { key: 'closed_by', label: t('Identifiant de l’administrateur'), children: detailShift.closed_by },
              { key: 'reason', label: t('Motif de clôture'), children: detailShift.close_reason || '—' },
            ] : []),
          ]} />
        )}
      </Modal>

      <Modal
        title={actionTitle}
        open={action !== null}
        onCancel={() => { setAction(null); setReason(''); }}
        onOk={submitAction}
        okButtonProps={{ loading: actionLoading, disabled: !reason.trim() }}
        okText={t('Confirmer')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        <Text>{t('Un motif est obligatoire et sera conservé dans le journal d’audit.')}</Text>
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 6 }}
          maxLength={1000}
          showCount
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder={t('Motif obligatoire')}
          style={{ marginTop: 12 }}
        />
      </Modal>
    </div>
  );
};

export default AdminEmployees;
