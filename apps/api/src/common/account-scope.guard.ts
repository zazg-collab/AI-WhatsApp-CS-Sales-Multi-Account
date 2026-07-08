import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessAccount } from './account-scope.util';

/**
 * Route-level counterpart to assertConversationScope(): for controllers
 * whose route param IS a whatsappAccountId (e.g. `wa/accounts/:id/...`),
 * rejects (404, not 403 — consistent with the rest of the app) when the
 * caller's admin scope doesn't cover that account. No-ops for unrestricted
 * roles (owner/supervisor/viewer) and for routes with no `:id` param.
 *
 * Apply at controller level on any `@Controller('.../:id/...')` whose id IS
 * a WhatsApp account id — do NOT apply where `:id` means something else
 * (e.g. a conversation/campaign id; those use assertConversationScope /
 * assertCampaignScope directly in the service instead).
 */
@Injectable()
export class AccountScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const accountId: string | undefined = req.params?.id;
    if (!accountId) return true;
    if (!(await canAccessAccount(this.prisma, accountId, req.user))) {
      throw new NotFoundException('WhatsApp account not found');
    }
    return true;
  }
}
