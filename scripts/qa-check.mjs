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
const knowledgePage = read('apps/web/src/app/knowledge/page.tsx');
assert.match(knowledgeService, /contentType = res\.headers\.get\('content-type'\)/, 'Knowledge URL ingest must inspect content-type');
assert.match(knowledgeService, /extractFromFile\(raw, urlName, contentType\)/, 'Knowledge URL ingest must support direct document URLs');
assert.match(documentExtract, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/, 'Knowledge ingest must support Excel MIME types');
assert.match(knowledgePage, /Upload PDF, Word \(\.docx\), Excel/, 'Knowledge UI must advertise file and website ingestion');

const conversationsService = read('apps/api/src/modules/conversations/conversations.service.ts');
const inboxPage = read('apps/web/src/app/inbox/page.tsx');
assert.match(conversationsService, /status: MessageStatus\.pending/, 'Manual sends must be persisted before gateway delivery');
assert.match(conversationsService, /message_send_failed/, 'Failed manual sends must be audited');
assert.match(inboxPage, /prev\.messages\.some\(\(m\) => m\.id === message\.id\)/, 'Inbox must de-duplicate live message events');
assert.match(inboxPage, /await loadConv\(activeId\);[\s\S]*setSendError/, 'Inbox must refresh failed sends so failed messages stay visible');

const auditPage = read('apps/web/src/app/audit/page.tsx');
assert.match(auditPage, /Failed to load audit log/, 'Audit UI must show load errors instead of silently failing');


const waService = read('apps/api/src/modules/wa/wa.service.ts');
const messageIngest = read('apps/api/src/modules/wa/message-ingest.service.ts');
assert.match(waService, /syncFullHistory: this\.syncFullHistory/, 'WhatsApp sync must request full phone history when enabled');
assert.match(waService, /Browsers\.macOS\('Desktop'\)/, 'WhatsApp history sync must use a desktop browser identity');
assert.match(waService, /type !== 'notify' && type !== 'append'/, 'WhatsApp sync must ingest live and history append messages');
assert.doesNotMatch(waService, /m\.key\.fromMe \|\| !m\.key\.remoteJid/, 'WhatsApp sync must not drop phone-sent fromMe messages');
assert.match(waService, /fromMe,[\s\S]*occurredAt: this\.messageTimestamp\(m\)/, 'WhatsApp sync must pass phone direction and timestamp into ingest');
assert.match(messageIngest, /senderType: fromMe \? SenderType\.admin : SenderType\.customer/, 'Phone-sent messages must appear as admin-side messages');
assert.match(messageIngest, /phone_message_sync/, 'Phone-sent messages must be audited as phone sync events');
assert.match(messageIngest, /!fromMe && !msg\.suppressAutomation/, 'Phone/history sync must not trigger customer automation side effects');

const dashboardController = read('apps/api/src/modules/dashboard/dashboard.controller.ts');
assert.match(dashboardController, /@Get\('performance'\)/, 'Performance overview endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/ai-quality'\)/, 'AI quality endpoint must exist');
assert.match(dashboardController, /@Get\('performance\/campaigns'\)/, 'Campaign performance endpoint must exist');

console.log('QA hardening checks passed');
