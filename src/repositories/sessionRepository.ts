import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export function listSessionsForUser(tenantId: string, userId: string) {
  return prisma.session.findMany({ where: { tenantId, userId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
}

export function createSession(tenantId: string, userId: string, data: { agentId?: string; channel?: string; metadata?: unknown }) {
  return prisma.session.create({
    data: {
      tenantId,
      userId,
      agentId: data.agentId || 'default_catarina',
      channel: data.channel || 'WebChat',
      status: 'active',
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function findSessionForUser(id: string, tenantId: string, userId: string) {
  return prisma.session.findFirst({ where: { id, tenantId, userId, deletedAt: null } });
}

export function updateSession(id: string, data: { status?: string; metadata?: Prisma.InputJsonValue }) {
  return prisma.session.update({ where: { id }, data });
}

export function deleteSession(id: string) {
  return prisma.session.update({ where: { id }, data: { deletedAt: new Date() } });
}

// Phone calls have no logged-in user (userId is null) — the caller is authenticated by the
// Twilio request signature, not a JWT, and tenant scoping comes from the resolved Agent instead.
export function createPhoneSession(tenantId: string, agentId: string, metadata: unknown) {
  return prisma.session.create({
    data: {
      tenantId,
      userId: null,
      agentId,
      channel: 'phone',
      status: 'active',
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function findSessionById(id: string) {
  return prisma.session.findFirst({ where: { id, deletedAt: null } });
}

// Twilio's status-callback webhook only ever gives us CallSid (its URL is configured statically
// on the phone number, so we can't thread our own sessionId through it like we do for /gather).
export function findActivePhoneSessionByCallSid(callSid: string) {
  return prisma.session.findFirst({
    where: { channel: 'phone', status: 'active', deletedAt: null, metadata: { path: ['callSid'], equals: callSid } },
  });
}

/**
 * Twilio may redeliver the initial `/voice` webhook if our first response times out. A plain
 * `findActivePhoneSessionByCallSid` followed by `createPhoneSession` is still race-prone when the
 * retry overlaps the original request, so the check + insert runs under SERIALIZABLE isolation.
 *
 * The provider's CallSid is globally unique within the Twilio account and is already covered by
 * Twilio request-signature verification at the route boundary. Returning the existing session is
 * therefore the correct replay behavior: same call, same runtime snapshot, no duplicate session.
 */
export async function createInboundPhoneSessionIfNoneForCallSid(
  tenantId: string,
  agentId: string,
  callSid: string,
  metadata: unknown,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.session.findFirst({
          where: {
            channel: 'phone',
            status: 'active',
            deletedAt: null,
            metadata: { path: ['callSid'], equals: callSid },
          },
        });
        if (existing) return { session: existing, created: false as const };

        const session = await tx.session.create({
          data: {
            tenantId,
            userId: null,
            agentId,
            channel: 'phone',
            status: 'active',
            metadata: (metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return { session, created: true as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // Under a real concurrent replay one serializable transaction may be aborted with P2034 after
    // the other commits. Re-read the winner rather than turning a harmless provider retry into a
    // 500. If no winner exists, propagate the database failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      const existing = await findActivePhoneSessionByCallSid(callSid);
      if (existing) return { session: existing, created: false as const };
    }
    throw error;
  }
}

/**
 * Atomically checks for an outbound call already in flight to this number and creates the new
 * phone session in the same database transaction.
 *
 * Doing the check and the create as two separate round-trips is a classic check-then-act race:
 * two near-simultaneous requests for the same tenant+number can both observe "no call in flight"
 * before either has written its own session, and both go on to dial the same lead for real.
 */
export async function createOutboundPhoneSessionIfNoneInFlight(
  tenantId: string,
  agentId: string,
  toNumber: string,
  metadata: unknown,
) {
  return prisma.$transaction(
    async (tx) => {
      const inFlight = await tx.session.findFirst({
        where: {
          tenantId,
          channel: 'phone',
          status: 'active',
          deletedAt: null,
          AND: [
            { metadata: { path: ['direction'], equals: 'outbound' } },
            { metadata: { path: ['to'], equals: toNumber } },
          ],
        },
      });
      if (inFlight) {
        return { session: null, inFlight: true as const };
      }

      const session = await tx.session.create({
        data: {
          tenantId,
          userId: null,
          agentId,
          channel: 'phone',
          status: 'active',
          metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      return { session, inFlight: false as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
