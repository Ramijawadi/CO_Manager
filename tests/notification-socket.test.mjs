import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { newToken, tokenHash } from '../server/auth.mjs';
import { attachNotificationSocket } from '../server/notification-socket.mjs';

class ChangeStream {
  changes = [];
  waiters = [];
  closed = false;

  async tryNext() { return null; }

  next() {
    if (this.changes.length) return Promise.resolve(this.changes.shift());
    if (this.closed) return Promise.reject(new Error('Stream closed.'));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  push(change) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(change);
    else this.changes.push(change);
  }

  async close() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('Stream closed.'));
  }
}

function makeDatabase({ user, session, ticketHash, stream }) {
  const tickets = new Map([[ticketHash, {
    ticket_hash: ticketHash, user_id: user.id, auth_session_id: session.id,
    expires_at: new Date(Date.now() + 30_000),
  }]]);
  const users = new Map([[user.id, user]]);
  const sessions = new Map([[session.id, session]]);
  return {
    watch: () => stream,
    collection(name) {
      if (name === 'socket_tickets') {
        return {
          findOneAndDelete: async filter => {
            const ticket = tickets.get(filter.ticket_hash);
            if (!ticket || ticket.expires_at <= filter.expires_at.$gt) return null;
            tickets.delete(filter.ticket_hash);
            return ticket;
          },
        };
      }
      if (name === 'auth_sessions') return { findOne: async filter => sessions.get(filter.id) || null };
      if (name === 'users') return { findOne: async filter => users.get(filter.id) || null };
      if (name === 'notifications') return { findOne: async () => null };
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

test('socket tickets are single-use and sockets only receive sanitized private notifications', async t => {
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const user = { id: userId, role: 'employee', status: 'active' };
  const session = { id: sessionId, user_id: userId, expires_at: new Date(Date.now() + 60_000) };
  const ticket = newToken();
  const stream = new ChangeStream();
  const db = makeDatabase({ user, session, ticketHash: tokenHash(ticket), stream });
  const httpServer = createServer();
  const socketServer = new Server(httpServer, { transports: ['websocket'] });
  const closeNotificationSocket = await attachNotificationSocket(socketServer, db);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const client = createClient(url, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    auth: { ticket, userId: crypto.randomUUID(), role: 'admin' },
  });
  t.after(async () => {
    client.disconnect();
    await closeNotificationSocket();
    await new Promise(resolve => socketServer.close(resolve));
  });

  await once(client, 'connect');
  assert.equal((await socketServer.in('role:admin').allSockets()).size, 0);
  const delivered = once(client, 'notification:new');
  stream.push({
    operationType: 'insert',
    fullDocument: {
      id: crypto.randomUUID(),
      recipient_id: userId,
      recipient_role: 'employee',
      sender_id: crypto.randomUUID(),
      dedupe_key: 'private-key',
      type: 'admin_announcement',
      title: 'Information',
      message: 'Brief de service.',
      priority: 'normal',
      action_url: '/notifications',
      data: {},
      read_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _id: { internal: true },
    },
  });
  const [payload] = await delivered;
  assert.equal(payload.title, 'Information');
  assert.equal(payload.recipient_id, undefined);
  assert.equal(payload.sender_id, undefined);
  assert.equal(payload.dedupe_key, undefined);
  assert.equal(payload._id, undefined);

  const secondClient = createClient(url, {
    path: '/socket.io', transports: ['websocket'], reconnection: false, auth: { ticket },
  });
  const denied = new Promise((resolve, reject) => {
    secondClient.once('connect_error', resolve);
    secondClient.once('connect', () => reject(new Error('A consumed socket ticket was accepted.')));
  });
  secondClient.connect();
  await denied;
  secondClient.disconnect();

  let receivedUnownedNotification = false;
  const unexpectedDelivery = new Promise(resolve => {
    client.once('notification:new', () => { receivedUnownedNotification = true; resolve(); });
  });
  stream.push({
    operationType: 'insert',
    fullDocument: {
      id: crypto.randomUUID(),
      recipient_id: crypto.randomUUID(),
      type: 'admin_announcement',
      title: 'Private',
      message: 'Other employee.',
      priority: 'normal',
      created_at: new Date().toISOString(),
    },
  });
  await Promise.race([unexpectedDelivery, new Promise(resolve => setTimeout(resolve, 100))]);
  assert.equal(receivedUnownedNotification, false);
});
