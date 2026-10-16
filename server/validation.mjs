import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a saved UUID.');
const text = z.string().trim().max(10000);
const name = text.min(1).max(200);
const money = z.number().finite().nonnegative();
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const customer = z.object({
  full_name: name,
  email: z.union([z.email(), z.literal('')]).optional(),
  phone: text.optional(),
  notes: text.optional(),
  status: text.optional(),
}).strict();
const product = z.object({
  name, description: text.optional(), price: money,
  stock: z.number().int().nonnegative(),
}).strict();
const plan = z.object({
  name, duration_days: z.number().int().positive(), price: money,
}).strict();
const expense = z.object({
  name, category: name, amount: z.number().int().positive().max(1_000_000_000_000),
  expense_date: date, notes: text.optional(),
}).strict();
const payment = z.object({
  subscription_id: uuid, amount: z.number().int().positive().max(1_000_000_000_000),
  payment_date: date, notes: text.optional(),
}).strict();
const subscription = z.object({
  customer_id: uuid, plan_id: uuid, start_date: date, end_date: date,
  status: z.enum(['active', 'expired', 'cancelled']).optional(),
}).strict();
const session = z.object({ customer_id: uuid }).strict();
const checkout = z.object({
  status: z.literal('completed'), exit_time: timestamp, time_cost: money,
}).strict();
const sessionProduct = z.object({
  session_id: uuid, product_id: uuid, quantity: z.number().int().positive(),
  total_price: money,
}).strict();
const settings = z.object({ hourly_rate: money }).strict();
const closure = z.object({
  closure_date: date, total_visitors: z.number().int().nonnegative(),
  total_revenue: money, product_sales: money, time_revenue: money,
}).strict();
const room = z.object({
  room_number: z.string().trim().min(1).max(40),
  name: text.max(200).optional(),
  notes: text.optional(),
}).strict();
const roomRentalFields = z.object({
  room_id: uuid,
  tenant_name: name,
  phone: text.max(40).optional(),
  entry_date: date,
  expected_departure_date: date,
  actual_departure_date: date.nullable().optional(),
  notes: text.optional(),
}).strict();
const roomRental = roomRentalFields.superRefine((value, context) => {
  if (value.expected_departure_date < value.entry_date) {
    context.addIssue({
      code: 'custom', path: ['expected_departure_date'],
      message: 'La date de sortie prévue doit être postérieure ou égale à la date d’entrée.',
    });
  }
  if (value.actual_departure_date && value.actual_departure_date < value.entry_date) {
    context.addIssue({
      code: 'custom', path: ['actual_departure_date'],
      message: 'La date de sortie réelle ne peut pas précéder la date d’entrée.',
    });
  }
});
const utilityPaymentFields = z.object({
  rental_id: uuid,
  type: z.enum(['water', 'electricity']),
  billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a YYYY-MM billing period.'),
  status: z.enum(['paid', 'unpaid']),
  payment_date: date.nullable().optional(),
  amount: z.number().int().positive().max(1_000_000_000_000).nullable().optional(),
  invoice_reference: text.max(200).optional(),
  notes: text.optional(),
}).strict();
const utilityPayment = utilityPaymentFields.superRefine((value, context) => {
  if (value.status === 'paid' && !value.payment_date) {
    context.addIssue({ code: 'custom', path: ['payment_date'], message: 'A payment date is required for paid bills.' });
  }
  if (value.status === 'unpaid' && value.payment_date) {
    context.addIssue({ code: 'custom', path: ['payment_date'], message: 'An unpaid bill cannot have a payment date.' });
  }
});

export const schemas = {
  customers: { create: customer, update: customer.partial() },
  products: { create: product, update: product.partial() },
  expenses: { create: expense, update: expense.partial() },
  subscription_payments: { create: payment, update: payment.omit({ subscription_id: true }).partial() },
  plans: { create: plan, update: plan.partial() },
  subscriptions: { create: subscription, update: subscription.partial() },
  sessions: { create: session, update: checkout },
  session_products: { create: sessionProduct },
  settings: { update: settings },
  daily_closures: { create: closure },
  rooms: { create: room, update: room.partial() },
  room_rentals: { create: roomRental, update: roomRentalFields.partial() },
  utility_payments: {
    create: utilityPayment,
    update: utilityPaymentFields.omit({ rental_id: true }).partial(),
  },
};

export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).strict();
export const registrationSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().pipe(z.email().max(254)).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(10).max(1024),
}).strict();
export const employeeStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'rejected', 'disabled']),
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const shiftCloseSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const startShiftSchema = z.object({ requestId: uuid }).strict();
export const notificationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z.enum(['all', 'unread', 'read']).default('all'),
  type: z.enum([
    'employee_approval', 'account_status', 'shift_admin_closed', 'operational_request',
    'request_update', 'admin_announcement',
  ]).optional(),
}).strict();
export const notificationActionSchema = z.enum(['read', 'unread', 'archive', 'restore']);
export const adminNotificationSchema = z.object({
  recipientId: uuid.optional(),
  audience: z.enum(['all_employees']).optional(),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  actionUrl: z.string().max(200).optional(),
  idempotencyKey: uuid,
}).strict().refine(value => Boolean(value.recipientId) !== Boolean(value.audience), {
  message: 'Choose one recipient or one audience.',
});
export const operationalRequestSchema = z.object({
  type: z.enum(['assistance', 'issue', 'shift_correction', 'operation_approval', 'other']),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  idempotencyKey: uuid,
}).strict();
export const requestListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['open', 'in_progress', 'resolved', 'rejected']).optional(),
}).strict();
export const requestUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'rejected']),
  response: z.string().trim().min(1).max(2000),
}).strict();
export const userSchema = loginSchema.extend({
  password: z.string().min(10).max(1024),
  role: z.enum(['admin', 'employee', 'staff', 'demo']).default('employee'),
});
export const idSchema = uuid;

export function validateDates(document) {
  if (document.expected_departure_date && document.entry_date &&
      document.expected_departure_date < document.entry_date) {
    throw Object.assign(new Error('La date de sortie prévue doit être postérieure ou égale à la date d’entrée.'), { status: 400 });
  }
  if (document.actual_departure_date && document.entry_date &&
      document.actual_departure_date < document.entry_date) {
    throw Object.assign(new Error('La date de sortie réelle ne peut pas précéder la date d’entrée.'), { status: 400 });
  }
  if (document.end_date < document.start_date) {
    throw Object.assign(new Error('Subscription end date must be on or after its start date.'), { status: 400 });
  }
  if (document.exit_time && Date.parse(document.exit_time) < Date.parse(document.entry_time)) {
    throw Object.assign(new Error('Session exit time must be on or after entry time.'), { status: 400 });
  }
}
