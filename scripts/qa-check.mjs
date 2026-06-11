import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const envExample = read('.env.example');
assert.match(envExample, /JWT_SECRET=/, '.env.example must document JWT_SECRET');
assert.match(envExample, /DATABASE_URL=/, '.env.example must document DATABASE_URL');
assert.match(envExample, /REDIS_URL=/, '.env.example must document REDIS_URL');
assert.match(envExample, /WA_SESSION_DIR=/, '.env.example must document WA_SESSION_DIR');
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

const appLayout = read('apps/web/src/components/AppLayout.tsx');
const sidebar = read('apps/web/src/components/Sidebar.tsx');
const globalsCss = read('apps/web/src/app/globals.css');
const loginPage = read('apps/web/src/app/page.tsx');
const dashboardPage = read('apps/web/src/app/dashboard/page.tsx');
const frontendTaste = read('docs/frontend-design-taste.md');
const tasteSurface = [appLayout, sidebar, globalsCss, loginPage, dashboardPage, frontendTaste].join('\n');
assert.match(frontendTaste, /Design read: redesign-preserve/, 'Taste skill pass must document the design read');
assert.match(frontendTaste, /DESIGN_VARIANCE: 5/, 'Taste skill pass must document dial values');
assert.doesNotMatch(tasteSurface, /[—–]/, 'Taste skill pass must avoid em-dash and en-dash characters');
assert.doesNotMatch(tasteSurface, /(^|[^a-z-])h-screen/, 'Taste skill pass must avoid fixed h-screen shells');
assert.doesNotMatch(tasteSurface, /🔥|⚠|📎|💬|🤖|📄/u, 'Taste skill pass must avoid emoji-driven UI controls');
assert.doesNotMatch(sidebar, /<svg|<path/, 'Sidebar must avoid hand-rolled SVG navigation icons');
assert.match(globalsCss, /prefers-reduced-motion/, 'Frontend must provide a reduced-motion fallback');
assert.match(globalsCss, /\.wa-action:active/, 'Frontend must provide tactile active states');

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

const dashboardController = read('apps/api/src/modules/dashboard/dashboard.controller.ts');
assert.match(dashboardController, /@Get\('performance'\)/, 'Performance overview endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/ai-quality'\)/, 'AI quality endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/campaigns'\)/, 'Campaign performance endpoint must exist');

console.log('QA hardening checks passed');
