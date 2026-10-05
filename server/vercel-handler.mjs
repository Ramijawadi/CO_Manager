import { connectDatabase } from './db.mjs';
import { createApp } from './app.mjs';
import { DatabaseConfigError } from './config.mjs';

export function restoreApiPath(req) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('__path');
  if (path !== null) {
    url.pathname = `/api/${path.replace(/^\/+/, '')}`;
    url.searchParams.delete('__path');
    req.url = `${url.pathname}${url.search}`;
  }
  // Let Express parse the restored URL instead of Vercel's cached rewrite query.
  if (Object.hasOwn(req, 'query')) delete req.query;
}

export function createVercelHandler({ connect = connectDatabase, buildApp = createApp } = {}) {
  let application;
  const getApplication = () => {
    if (!application) {
      application = connect().then(({ db, client }) => buildApp({
        db, client, serverless: true, serveFrontend: false,
      }));
      application.catch(() => { application = undefined; });
    }
    return application;
  };

  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      restoreApiPath(req);
      const app = await getApplication();
      await new Promise((resolve, reject) => {
        const finish = () => {
          res.off('finish', finish);
          res.off('close', finish);
          resolve();
        };
        res.once('finish', finish);
        res.once('close', finish);
        try {
          app(req, res);
        } catch (error) {
          res.off('finish', finish);
          res.off('close', finish);
          reject(error);
        }
      });
    } catch (error) {
      console.error(`Vercel API initialization failed (${error.name}, code: ${error.code || 'unknown'}).`);
      if (error instanceof DatabaseConfigError) console.error(error.message);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        message: error instanceof DatabaseConfigError ? error.message
          : 'API initialization failed. Check MONGODB_URI, MONGODB_DB_NAME and Atlas network access in the Vercel project settings.',
      }));
    }
  };
}
