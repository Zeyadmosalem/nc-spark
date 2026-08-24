// Applies a migration through the Supabase Management API.
//
// The project has no local Postgres in this environment, and `supabase db
// push` needs a linked project plus Docker. This is the route every migration
// since M1 has actually taken.
//
//   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-migration.mjs <file.sql>');
  process.exit(1);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: readFileSync(file, 'utf8') }),
  });

const body = await res.text();
console.log(res.status, body.slice(0, 2000));
if (!res.ok) process.exit(1);
