import { useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Empty, Grid, Input, Popconfirm, Row, Select,
  Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined, EditOutlined, HomeOutlined, PlusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { AuthButton } from '../../components/AuthButton';
import { usePermissions } from '../../hooks/usePermissions';
import {
  archiveRental, archiveRoom, archiveUtilityPayment, createRental, createRoom,
  createUtilityPayment, getRoomRentals, getRooms, getUtilityPayments, updateRental,
  updateRoom, updateUtilityPayment,
} from './api';
import { RentalForm, RoomForm, UtilityPaymentForm } from './RoomManagementForms';
import type { Room, RoomRental, RoomRentalInput, UtilityPayment, UtilityPaymentInput } from './types';
import { useTranslation } from 'react-i18next';
import { getNumberLocale } from '../../i18n';
import { formatExpenseAmount } from '../expenses/types';

const EMPTY_ROOMS: Room[] = [];
const EMPTY_RENTALS: RoomRental[] = [];
const EMPTY_PAYMENTS: UtilityPayment[] = [];

type OccupancyFilter = 'all' | 'occupied' | 'available' | 'upcoming' | 'unpaid-water' | 'unpaid-electricity';

const dateLabel = (value?: string | null) => value ? dayjs(value).format('DD/MM/YYYY') : '—';
const isActive = (rental: RoomRental, today: string) => !rental.actual_departure_date && rental.entry_date <= today;

export default function RoomManagement() {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const numberLocale = getNumberLocale(i18n.resolvedLanguage);
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();
  const { isDemo } = usePermissions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OccupancyFilter>('all');
  const [openRoomForm, setOpenRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room>();
  const [rentalTarget, setRentalTarget] = useState<Room>();
  const [editingRental, setEditingRental] = useState<RoomRental>();
  const [detailRoom, setDetailRoom] = useState<Room>();
  const [paymentTarget, setPaymentTarget] = useState<RoomRental>();
  const [paymentType, setPaymentType] = useState<'water' | 'electricity'>();
  const [editingPayment, setEditingPayment] = useState<UtilityPayment>();

  const roomsQuery = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const rentalsQuery = useQuery({ queryKey: ['roomRentals'], queryFn: getRoomRentals });
  const paymentsQuery = useQuery({ queryKey: ['utilityPayments'], queryFn: getUtilityPayments });
  const rooms = roomsQuery.data ?? EMPTY_ROOMS;
  const rentals = rentalsQuery.data ?? EMPTY_RENTALS;
  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const upcomingLimit = dayjs(today).add(30, 'day').format('YYYY-MM-DD');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    void queryClient.invalidateQueries({ queryKey: ['roomRentals'] });
    void queryClient.invalidateQueries({ queryKey: ['utilityPayments'] });
  };
  const handleMutationSuccess = (label: string) => {
    refresh();
    void messageApi.success(t(label));
  };
  const createRoomMutation = useMutation({
    mutationFn: createRoom, onSuccess: () => { handleMutationSuccess('Chambre ajoutée.'); setOpenRoomForm(false); },
    onError: error => { void messageApi.error(error.message); },
  });
  const updateRoomMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Pick<Room, 'room_number' | 'name' | 'notes'> }) => updateRoom(id, data),
    onSuccess: () => { handleMutationSuccess('Chambre mise à jour.'); setOpenRoomForm(false); setEditingRoom(undefined); },
    onError: error => { void messageApi.error(error.message); },
  });
  const createRentalMutation = useMutation({
    mutationFn: createRental, onSuccess: () => { handleMutationSuccess('Location enregistrée avec les deux factures du mois.'); setRentalTarget(undefined); },
    onError: error => { void messageApi.error(error.message); },
  });
  const updateRentalMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoomRentalInput }) => updateRental(id, data),
    onSuccess: () => { handleMutationSuccess('Location mise à jour.'); setEditingRental(undefined); setRentalTarget(undefined); },
    onError: error => { void messageApi.error(error.message); },
  });
  const createPaymentMutation = useMutation({
    mutationFn: createUtilityPayment,
    onSuccess: () => { handleMutationSuccess('Facture enregistrée.'); setPaymentTarget(undefined); setPaymentType(undefined); },
    onError: error => { void messageApi.error(error.message); },
  });
  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<UtilityPaymentInput, 'rental_id'>> }) => updateUtilityPayment(id, data),
    onSuccess: () => { handleMutationSuccess('Facture mise à jour.'); setEditingPayment(undefined); setPaymentTarget(undefined); setPaymentType(undefined); },
    onError: error => { void messageApi.error(error.message); },
  });
  const archiveRoomMutation = useMutation({
    mutationFn: archiveRoom, onSuccess: () => { handleMutationSuccess('Chambre archivée.'); },
    onError: error => { void messageApi.error(error.message); },
  });
  const archiveRentalMutation = useMutation({
    mutationFn: archiveRental, onSuccess: () => { handleMutationSuccess('Location archivée.'); },
    onError: error => { void messageApi.error(error.message); },
  });
  const archivePaymentMutation = useMutation({
    mutationFn: archiveUtilityPayment, onSuccess: () => { handleMutationSuccess('Facture archivée.'); },
    onError: error => { void messageApi.error(error.message); },
  });
  const isSaving = createRoomMutation.isPending || updateRoomMutation.isPending ||
    createRentalMutation.isPending || updateRentalMutation.isPending ||
    createPaymentMutation.isPending || updatePaymentMutation.isPending;

  const roomRows = useMemo(() => rooms.map(room => {
    const roomRentals = rentals.filter(rental => rental.room_id === room.id);
    const current = roomRentals.find(rental => isActive(rental, today));
    const next = roomRentals.filter(rental => !rental.actual_departure_date && rental.entry_date > today)
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date))[0];
    const displayedRental = current ?? next;
    const rentalPayments = displayedRental
      ? payments.filter(payment => payment.rental_id === displayedRental.id)
      : [];
    const latestBill = (type: 'water' | 'electricity') => rentalPayments
      .filter(payment => payment.type === type)
      .sort((left, right) => right.billing_period.localeCompare(left.billing_period))[0];
    const water = latestBill('water');
    const electricity = latestBill('electricity');
    const leavingSoon = Boolean(current && current.expected_departure_date >= today &&
      current.expected_departure_date <= upcomingLimit);
    return { ...room, current, next, displayedRental, water, electricity, occupied: Boolean(current), leavingSoon };
  }), [rooms, rentals, payments, today, upcomingLimit]);

  const activeRentalCount = rentals.filter(rental => isActive(rental, today)).length;
  const upcomingDepartures = rentals.filter(rental => isActive(rental, today) &&
    rental.expected_departure_date >= today && rental.expected_departure_date <= upcomingLimit).length;
  const unpaidWater = payments.filter(payment => payment.type === 'water' && payment.status === 'unpaid').length;
  const unpaidElectricity = payments.filter(payment => payment.type === 'electricity' && payment.status === 'unpaid').length;
  const outstanding = payments.filter(payment => payment.status === 'unpaid')
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);

  const searchText = search.trim().toLocaleLowerCase('fr');
  const filteredRooms = roomRows.filter(room => {
    const matchSearch = !searchText || [
      room.room_number, room.name, room.current?.tenant_name ?? room.next?.tenant_name ?? '',
      room.current?.phone ?? room.next?.phone ?? '',
    ].some(value => value.toLocaleLowerCase('fr').includes(searchText));
    const matchFilter = filter === 'all' ||
      (filter === 'occupied' && room.occupied) ||
      (filter === 'available' && !room.occupied && !room.next) ||
      (filter === 'upcoming' && room.leavingSoon) ||
      (filter === 'unpaid-water' && room.water?.status === 'unpaid') ||
      (filter === 'unpaid-electricity' && room.electricity?.status === 'unpaid');
    return matchSearch && matchFilter;
  });

  const openRoom = (room?: Room) => { setEditingRoom(room); setOpenRoomForm(true); };
  const openRental = (room: Room, rental?: RoomRental) => {
    setRentalTarget(room);
    setEditingRental(rental);
  };
  const openPayment = (rental: RoomRental, type?: 'water' | 'electricity', payment?: UtilityPayment) => {
    setPaymentTarget(rental);
    setPaymentType(type);
    setEditingPayment(payment);
  };
  const submitRoom = (values: Pick<Room, 'room_number' | 'name' | 'notes'>) => {
    if (isDemo) return;
    if (editingRoom) updateRoomMutation.mutate({ id: editingRoom.id, data: values });
    else createRoomMutation.mutate(values);
  };
  const submitRental = (values: RoomRentalInput) => {
    if (isDemo) return;
    if (editingRental) updateRentalMutation.mutate({ id: editingRental.id, data: values });
    else createRentalMutation.mutate(values);
  };
  const submitPayment = (values: UtilityPaymentInput) => {
    if (isDemo) return;
    const { rental_id, ...data } = values;
    if (editingPayment) {
      updatePaymentMutation.mutate({ id: editingPayment.id, data });
      return;
    }
    const duplicate = payments.find(payment =>
      payment.rental_id === rental_id && payment.type === values.type &&
      payment.billing_period === values.billing_period);
    if (duplicate) {
      void messageApi.error(t('Une facture existe déjà pour cette période. Modifiez la facture existante.'));
      return;
    }
    createPaymentMutation.mutate(values);
  };

  const columns: TableColumnsType<(typeof roomRows)[number]> = [
    {
      title: t("Chambre"), dataIndex: 'room_number', width: 160,
      sorter: (left, right) => left.room_number.localeCompare(right.room_number, 'fr', { numeric: true }),
      render: (_: string, room) => <div className="rooms-table-cell">
        <Typography.Text strong><bdi>{room.name}</bdi></Typography.Text>
        {room.name !== room.room_number &&
          <Typography.Text type="secondary"><bdi>{room.room_number}</bdi></Typography.Text>}
      </div>,
    },
    {
      title: t("État"), dataIndex: 'occupied', width: 155,
      filters: [{ text: t('Occupée'), value: true }, { text: t('Disponible'), value: false }],
      onFilter: (value, room) => room.occupied === value,
      render: (_: boolean, room) => room.occupied
        ? <div className="rooms-table-cell"><Tag color="blue">{t("Occupée")}</Tag>
          {room.leavingSoon && <Tag color="orange">{t("Départ bientôt")}</Tag>}</div>
        : room.next ? <Tag color="purple">{t("Entrée prévue")}</Tag> : <Tag color="green">{t("Disponible")}</Tag>,
    },
    {
      title: t("Locataire"), dataIndex: 'current', width: 180,
      render: (_: RoomRental | undefined, room) => room.displayedRental
        ? <div className="rooms-table-cell">
          <Typography.Text><bdi>{room.displayedRental.tenant_name}</bdi></Typography.Text>
          <Typography.Text type="secondary">
            {room.displayedRental.phone
              ? <bdi dir="ltr">{room.displayedRental.phone}</bdi> : t('Téléphone non renseigné')}
          </Typography.Text>
        </div> : <Typography.Text type="secondary">—</Typography.Text>,
      sorter: (left, right) => (left.displayedRental?.tenant_name ?? '').localeCompare(right.displayedRental?.tenant_name ?? '', 'fr'),
    },
    {
      title: t("Entrée"), dataIndex: 'entry_date', width: 125,
      render: (_: unknown, room) => <bdi dir="ltr">{dateLabel(room.displayedRental?.entry_date)}</bdi>,
      sorter: (left, right) => (left.displayedRental?.entry_date ?? '').localeCompare(right.displayedRental?.entry_date ?? ''),
    },
    {
      title: t("Sortie prévue"), dataIndex: 'expected_departure_date', width: 145,
      render: (_: unknown, room) => <bdi dir="ltr">{dateLabel(room.displayedRental?.expected_departure_date)}</bdi>,
      sorter: (left, right) => (left.displayedRental?.expected_departure_date ?? '')
        .localeCompare(right.displayedRental?.expected_departure_date ?? ''),
    },
    {
      title: t("Eau"), dataIndex: 'water', width: 130,
      render: (payment: UtilityPayment | undefined) => payment
        ? <div className="rooms-table-cell">
          <Tag color={payment.status === 'paid' ? 'green' : 'red'}>
            {payment.status === 'paid' ? t("Payée") : t("Non payée")}
          </Tag>
          <Typography.Text type="secondary"><bdi dir="ltr">{payment.billing_period}</bdi></Typography.Text>
        </div> : <Tag>{t("À renseigner")}</Tag>,
    },
    {
      title: t("Électricité"), dataIndex: 'electricity', width: 130,
      render: (payment: UtilityPayment | undefined) => payment
        ? <div className="rooms-table-cell">
          <Tag color={payment.status === 'paid' ? 'green' : 'red'}>
            {payment.status === 'paid' ? t("Payée") : t("Non payée")}
          </Tag>
          <Typography.Text type="secondary"><bdi dir="ltr">{payment.billing_period}</bdi></Typography.Text>
        </div> : <Tag>{t("À renseigner")}</Tag>,
    },
    {
      title: t("Actions"), key: 'actions', fixed: screens.md ? 'right' : undefined, width: 180,
      render: (_: unknown, room) => <Space size={4} className="rooms-table-actions">
        <Button size="small" onClick={() => setDetailRoom(room)}>{t("Détails")}</Button>
        <Tooltip title={t("Modifier la chambre")}>
          <AuthButton size="small" icon={<EditOutlined />} aria-label={t("Modifier la chambre")}
            onClick={() => openRoom(room)} />
        </Tooltip>
        <Tooltip title={t("Nouvelle location")}>
          <AuthButton size="small" icon={<PlusOutlined />} disabled={Boolean(room.current)}
            aria-label={t("Nouvelle location")} onClick={() => openRental(room)} />
        </Tooltip>
        {!room.current && <Popconfirm title={t("Archiver la chambre")}
          description={t("La chambre sera masquée, mais son historique de locations et de factures sera conservé.")}
          onConfirm={() => archiveRoomMutation.mutate(room.id)}
          okText={t("Archiver")} cancelText={t("Annuler")}>
          <AuthButton size="small" danger icon={<DeleteOutlined />} aria-label={t("Archiver la chambre")}
            title={t("Archiver la chambre")} />
        </Popconfirm>}
      </Space>,
    },
  ];

  const allError = roomsQuery.error || rentalsQuery.error || paymentsQuery.error;
  const loading = roomsQuery.isLoading || rentalsQuery.isLoading || paymentsQuery.isLoading;
  const roomRentals = detailRoom ? rentals.filter(rental => rental.room_id === detailRoom.id)
    .sort((left, right) => right.entry_date.localeCompare(left.entry_date)) : [];
  const currentOrLatestRental = roomRentals.find(rental => isActive(rental, today)) ?? roomRentals[0];
  const roomPayments = detailRoom ? payments.filter(payment =>
    roomRentals.some(rental => rental.id === payment.rental_id))
    .sort((left, right) => right.billing_period.localeCompare(left.billing_period)) : [];

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
      {contextHolder}
      <div style={{ marginBottom: 16 }}>
        <Typography.Text style={{ fontSize: 15, color: '#64748b' }}>
          {t("Gérez vos chambres, locations et factures d’eau et d’électricité.")}{' '}</Typography.Text>
      </div>
      {allError && <Alert type="error" showIcon title={t("Impossible de charger la gestion des chambres")}
        description={allError.message} action={<Button onClick={() => {
          void Promise.all([roomsQuery.refetch(), rentalsQuery.refetch(), paymentsQuery.refetch()]);
        }}>{t("Réessayer")}</Button>} style={{ marginBottom: 16 }} />}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title={t("Chambres")} value={rooms.length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Occupées")} value={roomRows.filter(room => room.occupied).length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Disponibles")} value={roomRows.filter(room => !room.occupied && !room.next).length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Locataires actifs")} value={activeRentalCount} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Départs sous 30 jours")} value={upcomingDepartures} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Factures d’eau impayées")} value={unpaidWater} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Factures d’électricité impayées")} value={unpaidElectricity} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={t("Reste à payer")} value={formatExpenseAmount(outstanding, numberLocale)} loading={loading} /></Card></Col>
      </Row>

      <Card className="rooms-overview" variant="borderless" style={{ border: '1px solid #f1f5f9' }}
        title={<Space><HomeOutlined /><span>{t("Parc de chambres")}</span></Space>}
        extra={<AuthButton type="primary" icon={<PlusOutlined />} onClick={() => openRoom()}>
          {t("Ajouter une chambre")}{' '}</AuthButton>}>
        <div className="rooms-table-toolbar">
          <Input placeholder={t("Chambre, locataire ou téléphone")} prefix={<SearchOutlined />}
            aria-label={t("Rechercher une chambre, un locataire ou un téléphone")}
            value={search} onChange={event => setSearch(event.target.value)} allowClear className="rooms-table-search" />
          <Select aria-label={t("Filtrer les chambres")} value={filter} onChange={setFilter} className="rooms-table-filter"
            options={[
              { label: t("Tous les états"), value: 'all' }, { label: t("Occupées"), value: 'occupied' },
              { label: t("Disponibles"), value: 'available' }, { label: t("Départ sous 30 jours"), value: 'upcoming' },
              { label: t("Eau impayée"), value: 'unpaid-water' }, { label: t("Électricité impayée"), value: 'unpaid-electricity' },
            ]} />
          {filter !== 'all' || search ? <Button onClick={() => { setFilter('all'); setSearch(''); }}>{t("Réinitialiser")}</Button> : null}
        </div>
        <Table className="rooms-table" columns={columns} dataSource={filteredRooms} rowKey="id" loading={loading}
          tableLayout="fixed" scroll={{ x: 1205 }} pagination={{ pageSize: 14, showSizeChanger: true,
            showTotal: count => t('Total : {{count}} chambres', { count }) }}
          locale={{ emptyText: <Empty description={search || filter !== 'all'
            ? t("Aucune chambre ne correspond aux filtres.") : t("Aucune chambre enregistrée.")} /> }} />
      </Card>

      <Drawer title={detailRoom ? t('Détails — {{name}}', { name: detailRoom.name }) : t("Détails de la chambre")}
        open={Boolean(detailRoom)} onClose={() => setDetailRoom(undefined)} width={Math.min(850, window.innerWidth - 24)}>
        {detailRoom && <>
          <Space style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">{detailRoom.room_number}</Typography.Text>
            <AuthButton type="primary" icon={<PlusOutlined />} disabled={isDemo}
              onClick={() => openRental(detailRoom)}>{t("Nouvelle location")}</AuthButton>
          </Space>
          <Typography.Title level={5}>{t("Historique des locations")}</Typography.Title>
          <Table<RoomRental> size="small" rowKey="id" dataSource={roomRentals} pagination={false}
            scroll={{ x: 650 }} columns={[
              { title: t("Locataire"), dataIndex: 'tenant_name' },
              { title: t("Téléphone"), dataIndex: 'phone', render: value => value || '—' },
              { title: t("Entrée"), dataIndex: 'entry_date', render: dateLabel },
              { title: t("Sortie prévue"), dataIndex: 'expected_departure_date', render: dateLabel },
              { title: t("Sortie réelle"), dataIndex: 'actual_departure_date', render: dateLabel },
              { title: t("Actions"), key: 'actions', render: (_: unknown, rental) => <Space>
                <AuthButton type="text" icon={<EditOutlined />} aria-label={t("Modifier la location")}
                  onClick={() => openRental(detailRoom, rental)} />
                {!isActive(rental, today) && <Popconfirm title={t("Archiver la location")}
                  description={t("La location sera archivée; les factures liées seront conservées.")}
                  onConfirm={() => archiveRentalMutation.mutate(rental.id)}
                  okText={t("Archiver")} cancelText={t("Annuler")}>
                  <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label={t("Archiver la location")} />
                </Popconfirm>}
              </Space> },
            ]} />
          <Space style={{ width: '100%', justifyContent: 'space-between', margin: '24px 0 12px' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>{t("Historique des factures")}</Typography.Title>
            {currentOrLatestRental && <AuthButton icon={<PlusOutlined />} disabled={isDemo}
              onClick={() => openPayment(currentOrLatestRental)}>{t("Ajouter une facture")}</AuthButton>}
          </Space>
          <Table<UtilityPayment> size="small" rowKey="id" dataSource={roomPayments} pagination={false}
            scroll={{ x: 700 }} columns={[
              { title: t("Locataire"), render: (_: unknown, payment) =>
                roomRentals.find(rental => rental.id === payment.rental_id)?.tenant_name ?? '—' },
              { title: t("Type"), dataIndex: 'type', render: type => type === 'water' ? t('Eau') : t('Électricité') },
              { title: t("Période"), dataIndex: 'billing_period', sorter: (left, right) => left.billing_period.localeCompare(right.billing_period) },
              { title: t("Statut"), dataIndex: 'status', render: status => <Tag color={status === 'paid' ? 'green' : 'red'}>
                {status === 'paid' ? t("Payée") : t("Non payée")}
              </Tag> },
              { title: t("Date paiement"), dataIndex: 'payment_date', render: dateLabel },
              { title: t("Montant"), dataIndex: 'amount', render: (amount: UtilityPayment['amount']) =>
                amount === null ? '—' : formatExpenseAmount(amount, numberLocale) },
              { title: t("Actions"), key: 'actions', render: (_: unknown, payment) => <Space>
                <AuthButton type="text" icon={<EditOutlined />} aria-label={t("Modifier la facture")}
                  onClick={() => openPayment(roomRentals.find(rental => rental.id === payment.rental_id)!, payment.type, payment)} />
                <Popconfirm title={t("Archiver la facture")}
                  description={t("La facture sera archivée et ne sera plus incluse dans les statistiques.")}
                  onConfirm={() => archivePaymentMutation.mutate(payment.id)}
                  okText={t("Archiver")} cancelText={t("Annuler")}>
                  <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label={t("Archiver la facture")} />
                </Popconfirm>
              </Space> },
            ]} />
        </>}
      </Drawer>

      <RoomForm open={openRoomForm} initial={editingRoom} loading={isSaving}
        onCancel={() => { if (!isSaving) { setOpenRoomForm(false); setEditingRoom(undefined); } }}
        onSubmit={submitRoom} />
      {rentalTarget && <RentalForm open={Boolean(rentalTarget)} room={rentalTarget} initial={editingRental}
        loading={isSaving} onCancel={() => { if (!isSaving) { setRentalTarget(undefined); setEditingRental(undefined); } }}
        onSubmit={submitRental} />}
      {paymentTarget && <UtilityPaymentForm open={Boolean(paymentTarget)} rentalId={paymentTarget.id}
        utilityType={paymentType} initial={editingPayment} loading={isSaving}
        onCancel={() => { if (!isSaving) { setPaymentTarget(undefined); setPaymentType(undefined); setEditingPayment(undefined); } }}
        onSubmit={submitPayment} />}
    </div>
  );
}
