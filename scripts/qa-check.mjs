import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function fileUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

function exists(path) {
  return existsSync(fileUrl(path));
}

function read(path) {
  return readFileSync(fileUrl(path), 'utf8');
}

const envExample = read('.env.example');
assert.match(envExample, /JWT_SECRET=/, '.env.example must document JWT_SECRET');
assert.match(envExample, /DATABASE_URL=/, '.env.example must document DATABASE_URL');
assert.match(envExample, /REDIS_URL=/, '.env.example must document REDIS_URL');
assert.match(envExample, /WA_SESSION_DIR=/, '.env.example must document WA_SESSION_DIR');
assert.match(envExample, /WA_SYNC_FULL_HISTORY=true/, 'Env template must enable WhatsApp phone history sync by default');
assert.match(envExample, /RATE_LIMIT_PER_IP=/, '.env.example must document IP rate limits');
assert.match(envExample, /connection_limit=10/, '.env.example must document Prisma connection pool tuning');

const deploymentGuide = read('docs/deployment.md');
assert.match(deploymentGuide, /\/api\/v1\/health\/ready/, 'Deployment guide must document readiness checks');
assert.match(deploymentGuide, /WA_SESSION_DIR/, 'Deployment guide must document WhatsApp session persistence');

const healthController = read('apps/api/src/health.controller.ts');
assert.match(healthController, /@Get\('ready'\)/, 'Health controller must expose readiness endpoint');
assert.match(healthController, /@Get\('config'\)/, 'Health controller must expose non-secret config endpoint');
assert.match(healthController, /checkRequiredConfig/, 'Readiness must validate required config');

const appModule = read('apps/api/src/app.module.ts');
assert.match(appModule, /APP_FILTER[\s\S]*AllExceptionsFilter/, 'AppModule must register global exception filter');
assert.match(appModule, /APP_GUARD[\s\S]*RateLimitGuard/, 'AppModule must register global rate limiter');
assert.match(appModule, /APP_INTERCEPTOR[\s\S]*RequestLoggingInterceptor/, 'AppModule must register request logging');
assert.match(appModule, /RequestIdMiddleware/, 'AppModule must register request IDs');
assert.match(appModule, /SecurityHeadersMiddleware/, 'AppModule must register security headers');

const main = read('apps/api/src/main.ts');
assert.match(main, /forbidNonWhitelisted: true/, 'Validation must reject non-whitelisted fields');
assert.match(main, /SanitizationPipe/, 'Main bootstrap must register sanitization pipe');
assert.match(main, /enableShutdownHooks/, 'Main bootstrap must enable graceful shutdown hooks');
assert.match(main, /disable\('x-powered-by'\)/, 'Main bootstrap must disable x-powered-by');

const webError = read('apps/web/src/app/error.tsx');
assert.match(webError, /Something went wrong/, 'Web app must include route error boundary');

const schema = read('packages/database/prisma/schema.prisma');
assert.match(schema, /model Campaign\s*{[\s\S]*@@map\("campaigns"\)/, 'Campaign model must be mapped');
assert.match(schema, /model CampaignRecipient\s*{[\s\S]*idempotencyKey\s+String\s+@unique/, 'CampaignRecipient idempotency key must be unique');
assert.match(schema, /@@unique\(\[campaignId, customerId\]\)/, 'CampaignRecipient must prevent duplicate customers per campaign');

const campaignsService = read('apps/api/src/modules/campaigns/campaigns.service.ts');
assert.match(campaignsService, /BLOCKED_TAGS = \['opt_out', 'blocked', 'do_not_contact'\]/, 'Campaigns must exclude blocked/opt-out tags');
assert.match(campaignsService, /recipient\.status !== CampaignRecipientStatus\.queued/, 'Campaign processor must skip duplicate or stale recipient jobs');
assert.match(campaignsService, /isCampaignStatus\(status\)/, 'Campaign list must validate status filters');
assert.match(campaignsService, /jobId: `campaign-recipient-\$\{recipient\.id\}`/, 'Campaign queue jobs must be idempotently keyed per recipient');

const customersDto = read('apps/api/src/modules/customers/dto/customers.dto.ts');
assert.match(customersDto, /ArrayMaxSize\(100/, 'Bulk customer actions must cap request size at 100');

const customersService = read('apps/api/src/modules/customers/customers.service.ts');
assert.match(customersService, /Viewer users cannot be assigned as customer admins/, 'Viewer assignment must be blocked');
assert.match(customersService, /customers_bulk_updated/, 'Bulk customer actions must be audited');

const roles = read('apps/api/src/auth/roles.ts');
assert.match(roles, /const roleHierarchy/, 'RolesGuard must use hierarchy');
assert.match(roles, /userLevel >= minimumLevel/, 'RolesGuard must allow higher roles to satisfy lower requirements');


const knowledgeService = read('apps/api/src/modules/knowledge/knowledge.service.ts');
const documentExtract = read('apps/api/src/modules/knowledge/document-extract.util.ts');
assert.match(knowledgeService, /contentType = res\.headers\.get\('content-type'\)/, 'Knowledge URL ingest must inspect content-type');
assert.match(knowledgeService, /extractFromFile\(raw, urlName, contentType\)/, 'Knowledge URL ingest must support direct document URLs');
assert.match(documentExtract, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/, 'Knowledge ingest must support Excel MIME types');

const dashboardController = read('apps/api/src/modules/dashboard/dashboard.controller.ts');
assert.match(dashboardController, /@Get\('performance'\)/, 'Performance overview endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/ai-quality'\)/, 'AI quality endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/campaigns'\)/, 'Campaign performance endpoint must exist');


const webGlobals = read('apps/web/src/app/globals.css');
const webSidebar = read('apps/web/src/components/Sidebar.tsx');
const webIcons = read('apps/web/src/components/icons.tsx');
assert.match(webGlobals, /--hermes-indigo: #3730a3/, 'Web UI must use deep indigo as Hermes accent');
assert.match(webSidebar, /LayoutDashboard|Inbox|ShieldCheck|UsersRound/, 'Sidebar must use Lucide-style named outline icons');
assert.doesNotMatch(webSidebar, /<svg/, 'Sidebar must not inline ad-hoc SVG icons');
assert.match(webIcons, /strokeWidth=\{1\.75\}/, 'Icon system must use consistent Lucide-style outline stroke width');
assert.doesNotMatch(webSidebar, /[☀🌙⚠⏰👤⏳💡📎●✓✕🤖↩✅❌🚀🔥✨💬📊📈📁🎯🟢🔴🟡⭐🔍⚙🧠📱📞📋🙏]/u, 'Shared web shell must not use emoji or decorative Unicode icons');


const conflictFiles = [
  'apps/api/src/modules/conversations/conversations.controller.spec.ts',
  'apps/api/src/modules/conversations/conversations.controller.ts',
  'apps/api/src/modules/conversations/conversations.service.spec.ts',
  'apps/api/src/modules/conversations/conversations.service.ts',
  'apps/api/src/modules/wa/wa.service.ts',
  'apps/web/package.json',
  'apps/web/src/app/accounts/page.test.tsx',
  'apps/web/src/app/accounts/page.tsx',
  'apps/web/src/app/admin/users/page.test.tsx',
  'apps/web/src/app/admin/users/page.tsx',
  'apps/web/src/app/analytics/page.tsx',
  'apps/web/src/app/audit/page.tsx',
  'apps/web/src/app/bots/page.test.tsx',
  'apps/web/src/app/bots/page.tsx',
  'apps/web/src/app/campaigns/page.test.tsx',
  'apps/web/src/app/campaigns/page.tsx',
  'apps/web/src/app/customers/page.test.tsx',
  'apps/web/src/app/customers/page.tsx',
  'apps/web/src/app/dashboard/page.test.tsx',
  'apps/web/src/app/dashboard/page.tsx',
  'apps/web/src/app/hermes/page.test.tsx',
  'apps/web/src/app/hermes/page.tsx',
  'apps/web/src/app/knowledge/page.test.tsx',
  'apps/web/src/app/knowledge/page.tsx',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/app/monitoring/page.test.tsx',
  'apps/web/src/app/monitoring/page.tsx',
  'apps/web/src/app/page.test.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/settings/ai/page.test.tsx',
  'apps/web/src/app/settings/ai/page.tsx',
  'apps/web/src/app/templates/page.test.tsx',
  'apps/web/src/app/templates/page.tsx',
  'apps/web/src/components/AppLayout.test.tsx',
  'apps/web/src/components/AppLayout.tsx',
  'apps/web/src/components/Sidebar.test.tsx',
  'apps/web/src/components/Sidebar.tsx',
  'apps/web/src/components/ThemeToggle.tsx',
  'apps/web/tailwind.config.ts',
  'package-lock.json',
  'packages/database/prisma/schema.prisma',
  'scripts/qa-check.mjs',
];
const conflictMarkerPattern = new RegExp('^(<{7}|={7}|>{7})', 'm');
for (const file of conflictFiles) {
  if (!exists(file)) {
    continue;
  }
  const content = read(file);
  assert.doesNotMatch(content, conflictMarkerPattern, `${file} must not contain merge conflict markers`);
}

const mergeNotes = read('docs/merge-conflict-resolution.md');
assert.match(mergeNotes, /Do not drop production features/, 'Merge notes must document no-feature-loss resolution policy');
assert.match(mergeNotes, /conflict files are reset to the current main baseline/, 'Merge notes must document the conflict-safe reset strategy');
assert.match(mergeNotes, /shared shell components/, 'Merge notes must document where UI polish remains isolated');

console.log('QA hardening checks passed');
