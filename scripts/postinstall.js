// Root postinstall: generate the Prisma client for buildpack platforms
// (Railway/Heroku) whose install step doesn't run @sentinel/database's
// generate script. Environments that install without devDependencies
// (e.g. Vercel's web-only deploy) have no prisma CLI and don't need the
// client — skip instead of failing the whole install. A real generate
// failure still propagates so buildpack deploys fail loudly.
const { execSync } = require('child_process');

try {
  require.resolve('prisma');
} catch {
  console.log('[postinstall] prisma CLI not installed — skipping db:generate');
  process.exit(0);
}

execSync('npm run db:generate', { stdio: 'inherit' });
