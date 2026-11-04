const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

async function startServer() {
  const db = await PGlite.create({
    dataDir: 'C:/Users/Hari Priya/.gemini/antigravity/scratch/pgdata_brandtrace',
    extensions: { pg_trgm },
  });

  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    SET timezone = 'Asia/Kolkata';
  `);

  const server = new PGLiteSocketServer({
    db,
    port: 5432,
    host: '127.0.0.1',
  });

  await server.start();
  console.log('PostgreSQL 16 server is listening on 127.0.0.1:5432 with pg_trgm active!');
}

startServer().catch(err => {
  console.error('Failed to start PostgreSQL server:', err);
  process.exit(1);
});
