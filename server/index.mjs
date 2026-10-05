import { EventEmitter } from 'node:events';
import { connectDatabase, closeDatabase } from './db.mjs';
import { createApp } from './app.mjs';
import { schemas } from './validation.mjs';

let server;
let stream;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server?.close();
  server?.closeAllConnections();
  await stream?.close();
  await closeDatabase();
}

try {
  const { db, client } = await connectDatabase();
  await db.command({ ping: 1 });
  const collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
  if (!collections.has('users') || !collections.has('settings')) {
    throw new Error('Database is not initialized. Run npm run setup-db and npm run create-admin.');
  }
  const events = new EventEmitter();
  events.setMaxListeners(0);
  let realtime = false;
  stream = db.watch([{ $match: { 'ns.coll': { $in: Object.keys(schemas) } } }]);
  // Open the cursor before serving clients so live changes cannot be missed at startup.
  await stream.tryNext();
  realtime = true;
  const consumeChanges = async () => {
    try {
      while (!shuttingDown) {
        const change = await stream.next();
        events.emit('change', change.ns.coll);
      }
    } catch (error) {
      realtime = false;
      if (!shuttingDown) {
        console.error(`MongoDB live updates failed (${error.name}). Restart the API after fixing the connection.`);
      }
    }
  };
  void consumeChanges();
  const app = await createApp({ db, client, events, realtimeReady: () => realtime });
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  server = app.listen(port, () => console.log(`Co-Manager API listening on port ${port}.`));
  server.on('close', () => app.emit('close'));
  server.on('error', async error => {
    console.error(`API startup failed (${error.code || error.name}).`);
    process.exitCode = 1;
    await shutdown();
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`API startup failed (${error.name}). ${error.name === 'Error' ? error.message : 'Check MongoDB credentials, Atlas network access, replica-set support and permissions.'}`);
  process.exitCode = 1;
  await shutdown();
}
