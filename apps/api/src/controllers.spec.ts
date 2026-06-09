import { ForbiddenException } from '@nestjs/common';

jest.mock('./modules/wa/wa.service', () => ({ WaService: class {} }));

import { AuthController } from './auth/auth.controller';
import { HealthController } from './health.controller';
import { AiController } from './modules/ai/ai.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { KnowledgeController } from './modules/knowledge/knowledge.controller';
import { BotsController } from './modules/bots/bots.controller';
import { HermesController } from './modules/hermes/hermes.controller';
import { CampaignsController } from './modules/campaigns/campaigns.controller';
import { UsersController } from './modules/users/users.controller';
import { AuditController } from './modules/audit/audit.controller';
import { FollowUpsController } from './modules/followups/followups.controller';
import { WaController } from './modules/wa/wa.controller';

const fn = () => jest.fn().mockResolvedValue({});

describe('AuthController', () => {
  const auth = { login: fn(), me: fn() } as any;
  const c = new AuthController(auth);
  it('login/logout/me', async () => {
    await c.login({ email: 'a', password: 'b' } as any);
    expect(c.logout()).toEqual({ success: true });
    c.me({ id: 'u1' } as any);
    expect(auth.login).toHaveBeenCalled();
    expect(auth.me).toHaveBeenCalledWith('u1');
  });
});

describe('HealthController', () => {
  it('check returns ok', () => {
    const c = new HealthController({} as any, { get: () => undefined } as any);
    expect(c.check().status).toBe('ok');
  });
});

describe('AiController', () => {
  const ai = { config: fn(), listModels: fn(), generateReply: fn(), summarizeChat: jest.fn().mockResolvedValue('s'), leadScore: fn() } as any;
  const c = new AiController(ai);
  it('delegates all', async () => {
    c.config();
    c.models();
    c.generateReply({ conversationId: 'c1' } as any);
    c.generateDraft({ conversationId: 'c1' } as any);
    expect(await c.summarize({ conversationId: 'c1' } as any)).toEqual({ summary: 's' });
    c.leadScore({ conversationId: 'c1' } as any);
    expect(ai.generateReply).toHaveBeenCalledTimes(2);
  });
});

describe('DashboardController', () => {
  const svc: any = {
    getSummary: fn(), getLeadFunnel: fn(), getMessageVolume: fn(), getAiModeBreakdown: fn(),
    getPerformanceOverview: fn(), getResponseTime: fn(), getAiQuality: fn(), getCampaignPerformance: fn(),
  };
  const c = new DashboardController(svc);
  it('delegates with parsed days', () => {
    c.getSummary(); c.getLeadFunnel(); c.getMessageVolume('5'); c.getAiModeBreakdown();
    c.getPerformance('10'); c.getResponseTime('3'); c.getAiQuality('7'); c.getCampaignPerformance('14');
    expect(svc.getMessageVolume).toHaveBeenCalledWith(5);
    expect(svc.getPerformanceOverview).toHaveBeenCalledWith(10);
  });
});

describe('KnowledgeController', () => {
  const svc: any = { listBases: fn(), createBase: fn(), getBase: fn(), updateBase: fn(), addItem: fn(), updateItem: fn() };
  const c = new KnowledgeController(svc);
  it('delegates', () => {
    c.list(); c.create({} as any, { id: 'u1' } as any); c.get('kb1');
    c.update('kb1', {} as any, { id: 'u1' } as any); c.addItem('kb1', {} as any); c.updateItem('ki1', {} as any);
    expect(svc.createBase).toHaveBeenCalledWith({}, 'u1');
  });
});

describe('BotsController', () => {
  const svc: any = { list: fn(), create: fn(), get: fn(), update: fn(), delete: fn(), assignToAccount: fn(), listPersonas: fn(), createPersona: fn(), updatePersona: fn() };
  const c = new BotsController(svc);
  it('delegates', () => {
    c.list(); c.create({} as any); c.get('b1'); c.update('b1', {} as any); c.delete('b1');
    c.assignToAccount('b1', 'a1'); c.listPersonas(); c.createPersona({} as any); c.updatePersona('p1', {} as any);
    expect(svc.assignToAccount).toHaveBeenCalledWith('b1', 'a1');
  });
});

describe('HermesController', () => {
  const svc: any = { review: fn(), alerts: fn(), dailyReport: fn(), botPerformance: fn(), performanceSnapshot: fn(), ask: fn(), botInsight: fn(), knowledgeGaps: fn(), approve: fn(), block: fn() };
  const c = new HermesController(svc);
  it('delegates', () => {
    c.reviewReply({ conversationId: 'c1', draftText: 'd' } as any);
    c.alerts(); c.dailyReport(); c.botPerformance(); c.snapshot();
    c.ask({ question: 'q' } as any); c.botInsight('b1'); c.knowledgeGaps();
    c.approve({ conversationId: 'c1' } as any); c.block({ conversationId: 'c1' } as any);
    expect(svc.review).toHaveBeenCalledWith('c1', 'd');
    expect(svc.ask).toHaveBeenCalledWith('q');
  });
});

describe('CampaignsController', () => {
  const svc: any = { list: fn(), preview: fn(), create: fn(), get: fn(), update: fn(), submit: fn(), approve: fn(), start: fn(), pause: fn(), cancel: fn(), retryFailed: fn() };
  const c = new CampaignsController(svc);
  const u = { id: 'u1' } as any;
  it('delegates', () => {
    c.list('draft'); c.preview({ whatsappAccountId: 'a1' } as any); c.create({} as any, u); c.get('cmp1');
    c.update('cmp1', {} as any, u); c.submit('cmp1', u); c.approve('cmp1', u);
    c.start('cmp1', u); c.pause('cmp1', u); c.cancel('cmp1', u); c.retryFailed('cmp1', u);
    expect(svc.preview).toHaveBeenCalledWith('a1', {});
    expect(svc.start).toHaveBeenCalledWith('cmp1', 'u1');
  });
});

describe('UsersController', () => {
  const svc: any = { list: fn(), create: fn(), get: fn(), update: fn(), delete: fn(), changePassword: fn() };
  const c = new UsersController(svc);
  it('list/create/delete delegate', () => {
    c.list('admin', '10', '5'); c.create({} as any, { id: 'u1' } as any); c.delete('u2', { id: 'u1' } as any);
    expect(svc.list).toHaveBeenCalledWith({ role: 'admin', limit: 10, offset: 5 });
  });
  it('get enforces self/owner access', async () => {
    await c.get('u1', { id: 'u1', role: 'admin' } as any);
    await c.get('u2', { id: 'admin', role: 'owner' } as any);
    await expect(c.get('u2', { id: 'u1', role: 'admin' } as any)).rejects.toThrow(ForbiddenException);
  });
  it('update enforces ownership + role guard', async () => {
    await c.update('u1', { name: 'x' } as any, { id: 'u1', role: 'admin' } as any);
    await expect(c.update('u2', {} as any, { id: 'u1', role: 'admin' } as any)).rejects.toThrow(ForbiddenException);
    await expect(c.update('u1', { role: 'owner' } as any, { id: 'u1', role: 'admin' } as any)).rejects.toThrow(ForbiddenException);
  });
  it('changePassword enforces self/owner', () => {
    c.changePassword('u1', {} as any, { id: 'u1', role: 'admin' } as any);
    expect(() => c.changePassword('u2', {} as any, { id: 'u1', role: 'admin' } as any)).toThrow(ForbiddenException);
  });
});

describe('AuditController', () => {
  const svc: any = { list: fn() };
  const c = new AuditController(svc);
  it('parses paging', () => {
    c.list('Thing', 'create', '2024', '2025', '10', '0');
    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 0 }));
  });
});

describe('FollowUpsController', () => {
  const svc: any = { schedule: fn(), list: fn(), cancel: fn() };
  const c = new FollowUpsController(svc);
  it('delegates', () => {
    c.schedule({} as any); c.list('c1'); c.cancel('f1');
    expect(svc.cancel).toHaveBeenCalledWith('f1');
  });
});

describe('WaController', () => {
  const wa: any = { startSession: fn(), getQr: jest.fn().mockReturnValue('qr'), isConnected: jest.fn().mockReturnValue(true), restart: fn() };
  const prisma: any = {
    whatsappAccount: { findMany: fn(), create: jest.fn().mockResolvedValue({ id: 'acc1' }), update: fn() },
  };
  const c = new WaController(wa, prisma);
  it('list/qr/restart/update/create', async () => {
    c.list();
    expect(c.qr('acc1')).toEqual({ qr: 'qr', connected: true });
    expect(await c.restart('acc1')).toEqual({ success: true });
    c.update('acc1', {} as any);
    await c.create({ accountName: 'A' } as any);
    expect(wa.startSession).toHaveBeenCalledWith('acc1');
  });
});
