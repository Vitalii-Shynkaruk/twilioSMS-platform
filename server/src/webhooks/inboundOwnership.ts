type ResolveInboundOwnerInput = {
  currentAssignedRepId: string | null;
  leadAssignedRepId: string | null;
  recentHumanOutboundRepIds: string[];
  activeRepIds: string[];
};

export function resolveInboundOwnerRepId(input: ResolveInboundOwnerInput): string | null {
  const activeRepIds = new Set(input.activeRepIds);

  if (input.currentAssignedRepId && activeRepIds.has(input.currentAssignedRepId)) {
    return input.currentAssignedRepId;
  }

  if (input.leadAssignedRepId && activeRepIds.has(input.leadAssignedRepId)) {
    return input.leadAssignedRepId;
  }

  const latestActiveSender = input.recentHumanOutboundRepIds.find((repId) => activeRepIds.has(repId));

  if (latestActiveSender) return latestActiveSender;

  return input.currentAssignedRepId || input.leadAssignedRepId || null;
}
