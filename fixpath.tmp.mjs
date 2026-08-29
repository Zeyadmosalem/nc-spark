import { readFileSync, writeFileSync } from 'node:fs';
const p = 'scripts/apply-migration.mjs';
let s = readFileSync(p, 'utf8');
const from = 'file.split(/[\/]/)';
const to = 'file.split(/[\\/]/)';
if (!s.includes(from)) { console.log('anchor missing'); process.exit(1); }
writeFileSync(p, s.replace(from, to));
console.log('replaced ->', to);
