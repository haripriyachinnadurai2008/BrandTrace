const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');

async function test() {
  const db = await PGlite.create({
    extensions: { pg_trgm },
  });
  await db.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  const res = await db.query("SELECT similarity('X1 Pro', 'X1 Pro Max') as sim;");
  console.log('OUTPUT_OF_SIMILARITY_QUERY:');
  console.log(JSON.stringify(res.rows));
}

test().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
