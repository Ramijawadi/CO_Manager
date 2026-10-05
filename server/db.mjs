import { MongoClient } from 'mongodb';
import { databaseConfig } from './config.mjs';

let client;
let connection;

export async function connectDatabase() {
  if (!connection) {
    const { uri, name } = databaseConfig();
    client = new MongoClient(uri);
    connection = client.connect().then(() => ({ client, db: client.db(name) }));
    connection.catch(() => { connection = undefined; });
  }
  return connection;
}

export async function closeDatabase() {
  await client?.close();
  connection = undefined;
}
