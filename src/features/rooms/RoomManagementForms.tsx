import { useEffect } from 'react';
import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Room, RoomRental, RoomRentalInput, UtilityPayment, UtilityPaymentInput, UtilityType } from './types';
import { useTranslation } from 'react-i18next';

const tunisToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

interface FormProps<T> {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: T) => void;
}

type RoomValues = Pick<Room, 'room_number' | 'name' | 'notes'>;

export function RoomForm({ open, loading, onCancel, onSubmit, initial }: FormProps<RoomValues> & { initial?: Room }) {
  const { t } = useTranslation();
  const [form] = Form.useForm<RoomValues>();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initial
      ? { room_number: initial.room_number, name: initial.name, notes: initial.notes }
      : { notes: '' });
  }, [form, initial, open]);
  return (
    <Modal title={initial ? t("Modifier la chambre") : t("Ajouter une chambre")} open={open}
      onCancel={onCancel} onOk={() => form.submit()} okText={t("Enregistrer")} cancelText={t("Annuler")}
      confirmLoading={loading} cancelButtonProps={{ disabled: loading }} closable={!loading}>
      <Form form={form} layout="vertical" disabled={loading} onFinish={values => onSubmit({
        ...values, room_number: values.room_number.trim(), name: values.name?.trim() || values.room_number.trim(),
        notes: values.notes?.trim() ?? '',
      })}>
        <Form.Item name="room_number" label={t("Numéro de chambre")} rules={[
          { required: true, whitespace: true, message: t("Veuillez saisir un numéro de chambre.") },
          { max: 40, message: t("Le numéro ne peut pas dépasser 40 caractères.") },
        ]}><Input maxLength={40} placeholder={t("Chambre 01")} /></Form.Item>
        <Form.Item name="name" label={t("Nom personnalisé")}><Input maxLength={200} placeholder={t("Facultatif")} /></Form.Item>
        <Form.Item name="notes" label={t("Notes")}><Input.TextArea rows={3} maxLength={10000} /></Form.Item>
      </Form>
    </Modal>
  );
}

type RentalValues = Omit<RoomRentalInput, 'entry_date' | 'expected_departure_date' | 'actual_departure_date'> & {
  entry_date: Dayjs;
  expected_departure_date: Dayjs;
  actual_departure_date?: Dayjs | null;
};

export function RentalForm({ open, loading, onCancel, onSubmit, room, initial }: FormProps<RoomRentalInput> & {
  room: Room;
  initial?: RoomRental;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<RentalValues>();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initial ? {
      room_id: initial.room_id, tenant_name: initial.tenant_name, phone: initial.phone,
      entry_date: dayjs(initial.entry_date), expected_departure_date: dayjs(initial.expected_departure_date),
      actual_departure_date: initial.actual_departure_date ? dayjs(initial.actual_departure_date) : null,
      notes: initial.notes,
    } : {
      room_id: room.id, entry_date: dayjs(tunisToday()),
      expected_departure_date: dayjs(tunisToday()).add(1, 'month'), notes: '',
    });
  }, [form, initial, open, room.id]);
  const finish = (values: RentalValues) => onSubmit({
    ...values,
    tenant_name: values.tenant_name.trim(),
    phone: values.phone?.trim() ?? '',
    entry_date: values.entry_date.format('YYYY-MM-DD'),
    expected_departure_date: values.expected_departure_date.format('YYYY-MM-DD'),
    actual_departure_date: values.actual_departure_date?.format('YYYY-MM-DD') ?? null,
    notes: values.notes?.trim() ?? '',
  });
  return (
    <Modal title={initial ? t("Modifier la location") : `Louer ${room.name}`} open={open}
      onCancel={onCancel} onOk={() => form.submit()} okText={t("Enregistrer")} cancelText={t("Annuler")}
      confirmLoading={loading} cancelButtonProps={{ disabled: loading }} closable={!loading}>
      <Form form={form} layout="vertical" disabled={loading} onFinish={finish}>
        <Form.Item name="room_id" hidden><Input /></Form.Item>
        <Form.Item name="tenant_name" label={t("Nom du locataire")} rules={[
          { required: true, whitespace: true, message: t("Veuillez saisir le nom du locataire.") },
          { max: 200, message: t("Le nom ne peut pas dépasser 200 caractères.") },
        ]}><Input maxLength={200} /></Form.Item>
        <Form.Item name="phone" label={t("Téléphone")} rules={[
          { max: 40, message: t("Le numéro ne peut pas dépasser 40 caractères.") },
          { pattern: /^[+()\d\s.-]*$/, message: t("Saisissez un numéro de téléphone valide.") },
        ]}><Input maxLength={40} /></Form.Item>
        <Form.Item name="entry_date" label={t("Date d'entrée")} rules={[{ required: true, message: t("Choisissez une date d’entrée.") }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="expected_departure_date" label={t("Date de sortie prévue")} rules={[{ required: true, message: t("Choisissez une date de sortie prévue.") }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        {initial && <Form.Item name="actual_departure_date" label={t("Date de sortie réelle")}>
          <DatePicker format="DD/MM/YYYY" allowClear style={{ width: '100%' }} />
        </Form.Item>}
        <Form.Item name="notes" label={t("Notes")}><Input.TextArea rows={3} maxLength={10000} /></Form.Item>
      </Form>
    </Modal>
  );
}

type UtilityValues = Omit<UtilityPaymentInput, 'billing_period' | 'payment_date'> & {
  billing_period: Dayjs;
  payment_date?: Dayjs | null;
};

export function UtilityPaymentForm({ open, loading, onCancel, onSubmit, rentalId, utilityType, initial }: FormProps<UtilityPaymentInput> & {
  rentalId: string;
  utilityType?: UtilityType;
  initial?: UtilityPayment;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<UtilityValues>();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initial ? {
      rental_id: initial.rental_id, type: initial.type, billing_period: dayjs(`${initial.billing_period}-01`),
      status: initial.status, payment_date: initial.payment_date ? dayjs(initial.payment_date) : null,
      amount: initial.amount, invoice_reference: initial.invoice_reference, notes: initial.notes,
    } : {
      rental_id: rentalId, type: utilityType ?? 'water',
      billing_period: dayjs(tunisToday()), status: 'unpaid', payment_date: null, invoice_reference: '', notes: '',
    });
  }, [form, initial, open, rentalId, utilityType]);
  const finish = (values: UtilityValues) => onSubmit({
    ...values, billing_period: values.billing_period.format('YYYY-MM'),
    payment_date: values.status === 'paid' ? values.payment_date?.format('YYYY-MM-DD') ?? null : null,
    amount: values.amount ?? null, invoice_reference: values.invoice_reference?.trim() ?? '',
    notes: values.notes?.trim() ?? '',
  });
  return (
    <Modal title={initial ? t("Modifier la facture") : t("Ajouter une facture")} open={open}
      onCancel={onCancel} onOk={() => form.submit()} okText={t("Enregistrer")} cancelText={t("Annuler")}
      confirmLoading={loading} cancelButtonProps={{ disabled: loading }} closable={!loading}>
      <Form form={form} layout="vertical" disabled={loading} onFinish={finish}>
        <Form.Item name="rental_id" hidden><Input /></Form.Item>
        <Form.Item name="type" label={t("Facture")} rules={[{ required: true }]}>
          <Select disabled={Boolean(initial)} options={[
            { label: t("Eau"), value: 'water' }, { label: t("Électricité"), value: 'electricity' },
          ]} />
        </Form.Item>
        <Form.Item name="billing_period" label={t("Période de facturation")} rules={[{ required: true, message: t("Choisissez la période.") }]}>
          <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="status" label={t("Statut")} rules={[{ required: true }]}>
          <Select options={[{ label: t("Non payée"), value: 'unpaid' }, { label: t("Payée"), value: 'paid' }]} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.status !== current.status}>
          {({ getFieldValue }) => getFieldValue('status') === 'paid' ? (
            <Form.Item name="payment_date" label={t("Date de paiement")} rules={[{ required: true, message: t("Choisissez la date de paiement.") }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
        </Form.Item>
        <Form.Item name="amount" label={t("Montant (DT)")} rules={[
          { type: 'number', min: 0.001, max: 1_000_000_000, message: t("Le montant doit être positif.") },
        ]}><InputNumber min={0.001} max={1_000_000_000} precision={3} step={0.001} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="invoice_reference" label={t("Référence de facture")}><Input maxLength={200} /></Form.Item>
        <Form.Item name="notes" label={t("Notes")}><Input.TextArea rows={2} maxLength={10000} /></Form.Item>
      </Form>
    </Modal>
  );
}
