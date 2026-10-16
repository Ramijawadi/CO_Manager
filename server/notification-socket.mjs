import { tokenHash } from './auth.mjs';
import { publicNotification } from './notifications.mjs';

const userRoom = userId => `user:${userId}`;

export async function attachNotificationSocket(io, db, onAvailabilityChange = () => {}) {
  io.use(async (socket, next) => {
    try {
      const ticket = socket.handshake.auth?.ticket;
      if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) {
        return next(new Error('Authentication required.'));
      }
      const savedTicket = await db.collection('socket_tickets').findOneAndDelete({
        ticket_hash: tokenHash(ticket),
        expires_at: { $gt: new Date() },
      });
      const record = savedTicket?.value ?? savedTicket;
      if (!record) return next(new Error('Authentication ticket expired.'));
      const [session, user] = await Promise.all([
        db.collection('auth_sessions').findOne({
          id: record.auth_session_id, user_id: record.user_id, expires_at: { $gt: new Date() },
        }),
        db.collection('users').findOne({ id: record.user_id }),
      ]);
      if (!session || !user || (user.status && user.status !== 'active')) {
        return next(new Error('Account is not active.'));
      }
      socket.data.user = { id: user.id, role: user.role };
      socket.data.authSessionId = session.id;
      next();
    } catch {
      console.error('Notification socket authentication failed.');
      next(new Error('Unable to authenticate this connection.'));
    }
  });

  io.on('connection', socket => {
    const { id, role } = socket.data.user;
    socket.join(userRoom(id));
    if (role === 'admin') socket.join('role:admin');
  });

  const stream = db.watch(
    [{ $match: { 'ns.coll': 'notifications' } }],
    { fullDocument: 'updateLookup' },
  );
  let stopped = false;
  await stream.tryNext();
  onAvailabilityChange(true);
  void (async () => {
    try {
      while (!stopped) {
        const change = await stream.next();
        const notificationId = change.fullDocument?.id || change.documentKey?.id;
        if (!notificationId) continue;
        const notification = change.fullDocument || await db.collection('notifications').findOne({
          id: notificationId,
        });
        if (!notification?.recipient_id) continue;
        const eventName = change.operationType === 'insert' ? 'notification:new' : 'notification:updated';
        io.to(userRoom(notification.recipient_id)).emit(eventName, publicNotification(notification));
      }
    } catch (error) {
      if (!stopped) {
        onAvailabilityChange(false);
        io.disconnectSockets(true);
        console.error(`Notification change stream stopped (${error.name}). Persisted notifications remain available through the API.`);
      }
    }
  })();

  const sessionCheck = setInterval(async () => {
    try {
      const sockets = await io.fetchSockets();
      for (const socket of sockets) {
        const session = await db.collection('auth_sessions').findOne({
          id: socket.data.authSessionId,
          expires_at: { $gt: new Date() },
        });
        const user = session && await db.collection('users').findOne({ id: socket.data.user.id });
        if (!user || (user.status && user.status !== 'active') ||
            user.role !== socket.data.user.role) {
          socket.disconnect(true);
        }
      }
    } catch (error) {
      console.error(`Notification connection revalidation failed (${error.name}).`);
      const sockets = await io.fetchSockets().catch(() => []);
      for (const socket of sockets) socket.disconnect(true);
    }
  }, 30_000);
  sessionCheck.unref?.();

  return async () => {
    stopped = true;
    clearInterval(sessionCheck);
    await stream.close();
  };
}

export function socketAllowedOrigins() {
  const configured = [
    ...(process.env.SOCKET_ALLOWED_ORIGINS || '').split(','),
    process.env.APP_ORIGIN || '',
  ].map(origin => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return [...new Set(configured)];
}
