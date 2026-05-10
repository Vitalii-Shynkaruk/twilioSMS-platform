import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';

type PipelineUser = AuthRequest['user'];

export function isAdminLike(user: PipelineUser): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
}

export function repScopeFilter(repId: string, includeAssist = true): Prisma.DealWhereInput {
  if (!includeAssist) return { assignedRepId: repId };
  return {
    OR: [{ assignedRepId: repId }, { assistingRepIds: { array_contains: repId } }],
  };
}

export function repFilter(user: PipelineUser, options?: { primaryOnly?: boolean }): Prisma.DealWhereInput {
  if (isAdminLike(user)) return {};
  if (!user?.id) return { assignedRepId: '__no_user__' };
  return repScopeFilter(user.id, !options?.primaryOnly);
}

export function canUseUnscopedTeamScope(user: PipelineUser, teamView: unknown, selectedRepId?: string | null): boolean {
  return teamView === 'true' && isAdminLike(user) && !selectedRepId;
}

export function fundingRepScopeFilter(repId: string): Prisma.FundingEventWhereInput {
  return {
    OR: [{ repId }, { deal: repScopeFilter(repId, true) }],
  };
}
