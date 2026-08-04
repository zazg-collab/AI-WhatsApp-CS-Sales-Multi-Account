// Root postinstall: generate the Prisma client for buildpack platforms
// (Railway/Heroku) whose install step doesn't run @sentinel/database's
// generate script. Environments that install without devDependencies
// (e.g. Vercel's web-only deploy) have no prisma CLI and don't need the
// client — skip instead of failing the whole install. A real generate
// failure still propagates so buildpack deploys fail loudly.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// >>> ANGGA — jangan berpura-pura bisa generate saat schema-nya belum ada.
//
// Di Docker, `npm ci` jalan pada tahap yang HANYA memuat package*.json —
// `packages/database/prisma/schema.prisma` belum disalin. Dulu postinstall
// tetap memanggil `db:generate` di situ dan build gagal. Dockerfile sudah
// menjalankan `npm run db:generate` SENDIRI sesudah `COPY . .`, jadi di situlah
// tempat yang benar.
//
// Di Railway/Heroku seluruh sumber sudah ada saat install, jadi perilakunya di
// sana TIDAK berubah sama sekali — penjaga ini tidak pernah menyala.
const schema = path.join(__dirname, '..', 'packages', 'database', 'prisma', 'schema.prisma');
if (!fs.existsSync(schema)) {
  console.log('[postinstall] schema Prisma belum ada di tahap ini — dilewati');
  process.exit(0);
}

try {
  require.resolve('prisma');
} catch {
  console.log('[postinstall] prisma CLI not installed — skipping db:generate');
  process.exit(0);
}

execSync('npm run db:generate', { stdio: 'inherit' });
