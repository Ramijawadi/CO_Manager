import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const notificationInputSchema = z.object({
  recipientId: z.string().uuid(),
  senderId: z.string().uuid().nullable().default(null),
  type: z.enum([
    'employee_approval', 'account_status', 'shift_admin_closed', 'operational_request',
    'request_update', 'admin_announcement',
  ]),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  actionUrl: z.string().max(200).optional(),
  data: z.record(z.string(), z.union([z.string().max(200), z.number().finite(), z.boolean()]))
    .refine(value => Object.keys(value).length <= 8, 'Too much notification metadata.').default({}),
  dedupeKey: z.string().min(1).max(200).optional(),
}).strict();

const safeActionUrl = /^\/(?:|admin\/employees|admin\/requests|notifications|sessions|customers|settings|reports|products|subscriptions|expenses|rooms)(?:\/[0-9a-f-]{36})?$/i;

export function publicNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    action_url: notification.action_url ?? null,
    data: notification.data ?? {},
    read_at: notification.read_at ?? null,
    archived_at: notification.archived_at ?? null,
    created_at: notification.created_at,
    updated_at: notification.updated_at,
  };
}

export async function createNotification(db, input, { session } = {}) {
  const notification = notificationInputSchema.parse(input);
  if (notification.actionUrl && !safeActionUrl.test(notification.actionUrl)) {
    throw Object.assign(new Error('The notification destination is not allowed.'), { status: 400 });
  }
  const recipient = await db.collection('users').findOne(
    { id: notification.recipientId },
    { session, projection: { id: 1, role: 1 } },
  );
  if (!recipient) throw Object.assign(new Error('Notification recipient not found.'), { status: 404 });
  if (notification.type === 'admin_announcement' &&
      (!['employee', 'staff'].includes(recipient.role) ||
       (recipient.status && recipient.status !== 'active'))) {
    throw Object.assign(new Error('Choose an active employee account.'), { status: 400 });
  }

  if (notification.dedupeKey) {
    const existing = await db.collection('notifications').findOne({
      recipient_id: recipient.id,
      dedupe_key: notification.dedupeKey,
    }, { session });
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    recipient_id: recipient.id,
    recipient_role: recipient.role,
    sender_id: notification.senderId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    action_url: notification.actionUrl || null,
    data: notification.data,
    read_at: null,
    archived_at: null,
    ...(notification.dedupeKey ? { dedupe_key: notification.dedupeKey } : {}),
    created_at: now,
    updated_at: now,
  };
  try {
    await db.collection('notifications').insertOne(record, { session });
    return record;
  } catch (error) {
    if (error.code !== 11000 || !notification.dedupeKey) throw error;
    if (session) throw error;
    const existing = await db.collection('notifications').findOne({
      recipient_id: recipient.id,
      dedupe_key: notification.dedupeKey,
    }, { session });
    if (!existing) throw error;
    return existing;
  }
}

export async function notifyAdmins(db, input, options) {
  const admins = await db.collection('users').find(
    { role: 'admin', status: { $in: ['active', null] } },
    { projection: { id: 1 }, ...(options?.session ? { session: options.session } : {}) },
  ).toArray();
  const records = [];
  for (const admin of admins) {
    records.push(await createNotification(db, {
      ...input,
      recipientId: admin.id,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${admin.id}` : undefined,
    }, options));
  }
  return records;
}
