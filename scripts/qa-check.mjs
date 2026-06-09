import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

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
