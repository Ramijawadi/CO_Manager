import { useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Empty, Input, Popconfirm, Row, Select,
  Space, Statistic, Table, Tag, Typography, message,
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

const EMPTY_ROOMS: Room[] = [];
const EMPTY_RENTALS: RoomRental[] = [];
const EMPTY_PAYMENTS: UtilityPayment[] = [];

type OccupancyFilter = 'all' | 'occupied' | 'available' | 'upcoming' | 'unpaid-water' | 'unpaid-electricity';

const money = (value: number | null | undefined) => value === null || value === undefined
  ? '—' : `${value.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const dateLabel = (value?: string | null) => value ? dayjs(value).format('DD/MM/YYYY') : '—';
const isActive = (rental: RoomRental, today: string) => !rental.actual_departure_date && rental.entry_date <= today;

export default function RoomManagement() {
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
    void messageApi.success(label);
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
    if (editingPayment) {
      updatePaymentMutation.mutate({ id: editingPayment.id, data: values });
      return;
    }
    const duplicate = payments.find(payment =>
      payment.rental_id === values.rental_id && payment.type === values.type &&
      payment.billing_period === values.billing_period);
    if (duplicate) {
      void messageApi.error('Une facture existe déjà pour cette période. Modifiez la facture existante.');
      return;
    }
    createPaymentMutation.mutate(values);
  };

  const columns: TableColumnsType<(typeof roomRows)[number]> = [
    {
      title: 'Chambre', dataIndex: 'room_number',
      sorter: (left, right) => left.room_number.localeCompare(right.room_number, 'fr', { numeric: true }),
      render: (_: string, room) => <Space direction="vertical" size={0}>
        <Typography.Text strong>{room.name}</Typography.Text>
        <Typography.Text type="secondary">{room.room_number}</Typography.Text>
      </Space>,
    },
    {
      title: 'État', dataIndex: 'occupied',
      filters: [{ text: 'Occupée', value: true }, { text: 'Disponible', value: false }],
      onFilter: (value, room) => room.occupied === value,
      render: (_: boolean, room) => room.occupied
        ? <Space size={4}><Tag color="blue">Occupée</Tag>
          {room.leavingSoon && <Tag color="orange">Départ bientôt</Tag>}</Space>
        : room.next ? <Tag color="purple">Entrée prévue</Tag> : <Tag color="green">Disponible</Tag>,
    },
    {
      title: 'Locataire', dataIndex: 'current', render: (_: RoomRental | undefined, room) => room.displayedRental
        ? <Space direction="vertical" size={0}>
          <span>{room.displayedRental.tenant_name}</span>
          <Typography.Text type="secondary">{room.displayedRental.phone || 'Téléphone non renseigné'}</Typography.Text>
        </Space> : '—',
      sorter: (left, right) => (left.displayedRental?.tenant_name ?? '').localeCompare(right.displayedRental?.tenant_name ?? '', 'fr'),
    },
    {
      title: "Entrée", dataIndex: 'entry_date',
      render: (_: unknown, room) => dateLabel(room.displayedRental?.entry_date),
      sorter: (left, right) => (left.displayedRental?.entry_date ?? '').localeCompare(right.displayedRental?.entry_date ?? ''),
    },
    {
      title: 'Sortie prévue', dataIndex: 'expected_departure_date',
      render: (_: unknown, room) => dateLabel(room.displayedRental?.expected_departure_date),
      sorter: (left, right) => (left.displayedRental?.expected_departure_date ?? '')
        .localeCompare(right.displayedRental?.expected_departure_date ?? ''),
    },
    {
      title: 'Eau', dataIndex: 'water', render: (payment: UtilityPayment | undefined) => payment
        ? <Tag color={payment.status === 'paid' ? 'green' : 'red'}>
          {payment.status === 'paid' ? 'Payée' : 'Non payée'} · {payment.billing_period}
        </Tag> : <Tag>À renseigner</Tag>,
    },
    {
      title: 'Électricité', dataIndex: 'electricity', render: (payment: UtilityPayment | undefined) => payment
        ? <Tag color={payment.status === 'paid' ? 'green' : 'red'}>
          {payment.status === 'paid' ? 'Payée' : 'Non payée'} · {payment.billing_period}
        </Tag> : <Tag>À renseigner</Tag>,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 220,
      render: (_: unknown, room) => <Space wrap>
        <Button size="small" onClick={() => setDetailRoom(room)}>Détails</Button>
        <AuthButton size="small" icon={<EditOutlined />} aria-label={`Modifier ${room.room_number}`}
          onClick={() => openRoom(room)} />
        <AuthButton size="small" icon={<PlusOutlined />} disabled={Boolean(room.current)}
          onClick={() => openRental(room)}>Location</AuthButton>
        {!room.current && <Popconfirm title="Archiver la chambre"
          description="La chambre sera masquée, mais son historique de locations et de factures sera conservé."
          onConfirm={() => archiveRoomMutation.mutate(room.id)}
          okText="Archiver" cancelText="Annuler">
          <AuthButton size="small" danger icon={<DeleteOutlined />} aria-label={`Archiver ${room.room_number}`} />
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
          Gérez vos chambres, locations et factures d’eau et d’électricité.
        </Typography.Text>
      </div>
      {allError && <Alert type="error" showIcon title="Impossible de charger la gestion des chambres"
        description={allError.message} action={<Button onClick={() => {
          void Promise.all([roomsQuery.refetch(), rentalsQuery.refetch(), paymentsQuery.refetch()]);
        }}>Réessayer</Button>} style={{ marginBottom: 16 }} />}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title="Chambres" value={rooms.length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Occupées" value={roomRows.filter(room => room.occupied).length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Disponibles" value={roomRows.filter(room => !room.occupied && !room.next).length} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Locataires actifs" value={activeRentalCount} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Départs sous 30 jours" value={upcomingDepartures} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Factures d’eau impayées" value={unpaidWater} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Factures d’électricité impayées" value={unpaidElectricity} loading={loading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Reste à payer" value={money(outstanding)} loading={loading} /></Card></Col>
      </Row>

      <Card variant="borderless" style={{ border: '1px solid #f1f5f9' }}
        title={<Space><HomeOutlined /><span>Parc de chambres</span></Space>}
        extra={<AuthButton type="primary" icon={<PlusOutlined />} onClick={() => openRoom()}>
          Ajouter une chambre
        </AuthButton>}>
        <Space wrap style={{ width: '100%', marginBottom: 16 }}>
          <Input placeholder="Chambre, locataire ou téléphone" prefix={<SearchOutlined />}
            aria-label="Rechercher une chambre, un locataire ou un téléphone"
            value={search} onChange={event => setSearch(event.target.value)} allowClear style={{ width: 300 }} />
          <Select aria-label="Filtrer les chambres" value={filter} onChange={setFilter} style={{ width: 240 }}
            options={[
              { label: 'Tous les états', value: 'all' }, { label: 'Occupées', value: 'occupied' },
              { label: 'Disponibles', value: 'available' }, { label: 'Départ sous 30 jours', value: 'upcoming' },
              { label: 'Eau impayée', value: 'unpaid-water' }, { label: 'Électricité impayée', value: 'unpaid-electricity' },
            ]} />
          {filter !== 'all' || search ? <Button onClick={() => { setFilter('all'); setSearch(''); }}>Réinitialiser</Button> : null}
        </Space>
        <Table columns={columns} dataSource={filteredRooms} rowKey="id" loading={loading}
          scroll={{ x: 1200 }} pagination={{ pageSize: 14, showSizeChanger: true,
            showTotal: count => `Total : ${count} chambre${count > 1 ? 's' : ''}` }}
          locale={{ emptyText: <Empty description={search || filter !== 'all'
            ? 'Aucune chambre ne correspond aux filtres.' : 'Aucune chambre enregistrée.'} /> }} />
      </Card>

      <Drawer title={detailRoom ? `Détails — ${detailRoom.name}` : 'Détails de la chambre'}
        open={Boolean(detailRoom)} onClose={() => setDetailRoom(undefined)} width={Math.min(850, window.innerWidth - 24)}>
        {detailRoom && <>
          <Space style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">{detailRoom.room_number}</Typography.Text>
            <AuthButton type="primary" icon={<PlusOutlined />} disabled={isDemo}
              onClick={() => openRental(detailRoom)}>Nouvelle location</AuthButton>
          </Space>
          <Typography.Title level={5}>Historique des locations</Typography.Title>
          <Table<RoomRental> size="small" rowKey="id" dataSource={roomRentals} pagination={false}
            scroll={{ x: 650 }} columns={[
              { title: 'Locataire', dataIndex: 'tenant_name' },
              { title: 'Téléphone', dataIndex: 'phone', render: value => value || '—' },
              { title: 'Entrée', dataIndex: 'entry_date', render: dateLabel },
              { title: 'Sortie prévue', dataIndex: 'expected_departure_date', render: dateLabel },
              { title: 'Sortie réelle', dataIndex: 'actual_departure_date', render: dateLabel },
              { title: 'Actions', key: 'actions', render: (_: unknown, rental) => <Space>
                <AuthButton type="text" icon={<EditOutlined />} aria-label="Modifier la location"
                  onClick={() => openRental(detailRoom, rental)} />
                {!isActive(rental, today) && <Popconfirm title="Archiver la location"
                  description="La location sera archivée; les factures liées seront conservées."
                  onConfirm={() => archiveRentalMutation.mutate(rental.id)}
                  okText="Archiver" cancelText="Annuler">
                  <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label="Archiver la location" />
                </Popconfirm>}
              </Space> },
            ]} />
          <Space style={{ width: '100%', justifyContent: 'space-between', margin: '24px 0 12px' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>Historique des factures</Typography.Title>
            {currentOrLatestRental && <AuthButton icon={<PlusOutlined />} disabled={isDemo}
              onClick={() => openPayment(currentOrLatestRental)}>Ajouter une facture</AuthButton>}
          </Space>
          <Table<UtilityPayment> size="small" rowKey="id" dataSource={roomPayments} pagination={false}
            scroll={{ x: 700 }} columns={[
              { title: 'Locataire', render: (_: unknown, payment) =>
                roomRentals.find(rental => rental.id === payment.rental_id)?.tenant_name ?? '—' },
              { title: 'Type', dataIndex: 'type', render: type => type === 'water' ? 'Eau' : 'Électricité' },
              { title: 'Période', dataIndex: 'billing_period', sorter: (left, right) => left.billing_period.localeCompare(right.billing_period) },
              { title: 'Statut', dataIndex: 'status', render: status => <Tag color={status === 'paid' ? 'green' : 'red'}>
                {status === 'paid' ? 'Payée' : 'Non payée'}
              </Tag> },
              { title: 'Date paiement', dataIndex: 'payment_date', render: dateLabel },
              { title: 'Montant', dataIndex: 'amount', render: money },
              { title: 'Actions', key: 'actions', render: (_: unknown, payment) => <Space>
                <AuthButton type="text" icon={<EditOutlined />} aria-label="Modifier la facture"
                  onClick={() => openPayment(roomRentals.find(rental => rental.id === payment.rental_id)!, payment.type, payment)} />
                <Popconfirm title="Archiver la facture"
                  description="La facture sera archivée et ne sera plus incluse dans les statistiques."
                  onConfirm={() => archivePaymentMutation.mutate(payment.id)}
                  okText="Archiver" cancelText="Annuler">
                  <AuthButton type="text" danger icon={<DeleteOutlined />} aria-label="Archiver la facture" />
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
