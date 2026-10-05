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

export const schemas = {
  customers: { create: customer, update: customer.partial() },
  products: { create: product, update: product.partial() },
  plans: { create: plan, update: plan.partial() },
  subscriptions: { create: subscription, update: subscription.partial() },
  sessions: { create: session, update: checkout },
  session_products: { create: sessionProduct },
  settings: { update: settings },
  daily_closures: { create: closure },
};

export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).strict();
export const userSchema = loginSchema.extend({
  password: z.string().min(10).max(1024),
  role: z.enum(['admin', 'staff', 'demo']).default('admin'),
});
export const idSchema = uuid;

export function validateDates(document) {
  if (document.end_date < document.start_date) {
    throw Object.assign(new Error('Subscription end date must be on or after its start date.'), { status: 400 });
  }
  if (document.exit_time && Date.parse(document.exit_time) < Date.parse(document.entry_time)) {
    throw Object.assign(new Error('Session exit time must be on or after entry time.'), { status: 400 });
  }
}
