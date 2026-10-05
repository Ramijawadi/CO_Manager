import { MongoClient } from 'mongodb';
import { databaseConfig } from './config.mjs';

let client;
let connection;

export async function connectDatabase() {
  if (!connection) {
    const { uri, name } = databaseConfig();
    client = new MongoClient(uri);
    const pendingClient = client;
    connection = pendingClient.connect().then(() => ({ client: pendingClient, db: pendingClient.db(name) }))
      .catch(async error => {
        connection = undefined;
        await pendingClient.close();
        throw error;
      });
  }
  return connection;
}

export async function closeDatabase() {
  await client?.close();
  connection = undefined;
}
