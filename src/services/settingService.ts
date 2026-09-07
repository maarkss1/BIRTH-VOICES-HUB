import * as settingRepository from '../repositories/settingRepository.js';
import { prisma } from '../lib/prisma.js';

const DEFAULT_SETTINGS = {
  theme: 'light',
  notificationsEnabled: true,
  mfaEnabled: false,
  recordingEnabled: true,
};

const DEFAULT_VOICE_RUNTIME = {
  voiceId: 'eleven_rachel',
  language: 'pt-BR',
  speed: 1.0,
  stability: 0.75,
  clarity: 0.85,
};

const DEFAULT_CHECKLIST = {
  orgCreated: true,
  agentCreated: false,
  telephonyConnected: false,
  knowledgeAdded: false,
  firstTest: false,
  agentPublished: false,
  analyticsActive: false,
  firstCallCompleted: false,
};

export async function getUserSettings(tenantId: string, userId: string) {
  const row = await settingRepository.findSetting(tenantId, userId, 'general');
  return row?.value ?? DEFAULT_SETTINGS;
}

export async function saveUserSettings(tenantId: string, userId: string, settings: Record<string, unknown>, merge: boolean) {
  let value = settings;
  if (merge) {
    const existing = await settingRepository.findSetting(tenantId, userId, 'general');
    value = { ...((existing?.value as Record<string, unknown>) ?? {}), ...settings };
  }
  await settingRepository.upsertSetting(tenantId, userId, 'general', value);
  return value;
}

export function resetUserSettings(tenantId: string, userId: string) {
  return settingRepository.deleteSetting(tenantId, userId, 'general');
}

export async function getVoiceRuntimeConfig(tenantId: string, userId: string) {
  const row = await settingRepository.findSetting(tenantId, userId, 'voice_runtime');
  return row?.value ?? DEFAULT_VOICE_RUNTIME;
}

export async function saveVoiceRuntimeConfig(tenantId: string, userId: string, config: Record<string, unknown>, merge: boolean) {
  let value = config;
  if (merge) {
    const existing = await settingRepository.findSetting(tenantId, userId, 'voice_runtime');
    value = { ...((existing?.value as Record<string, unknown>) ?? {}), ...config };
  }
  await settingRepository.upsertSetting(tenantId, userId, 'voice_runtime', value);
  return value;
}

export function resetVoiceRuntimeConfig(tenantId: string, userId: string) {
  return settingRepository.deleteSetting(tenantId, userId, 'voice_runtime');
}

export async function getChecklist(tenantId: string, userId: string) {
  const row = await settingRepository.findSetting(tenantId, userId, 'onboarding_checklist');
  return row?.value ?? DEFAULT_CHECKLIST;
}

export function saveChecklist(tenantId: string, userId: string, checklist: Record<string, boolean>) {
  return settingRepository.upsertSetting(tenantId, userId, 'onboarding_checklist', checklist);
}

export function resetChecklist(tenantId: string, userId: string) {
  return settingRepository.deleteSetting(tenantId, userId, 'onboarding_checklist');
}

// --- AI provider consent (LGPD) ---
//
// Consent for sending tenant/contact data to an external AI provider (OpenAI, Anthropic,
// Gemini, ElevenLabs) via LLMGateway. Backed by the dedicated `TenantAiConsent` model (one row
// per tenant, `granted: false` as a safe default) added by Agente 01 — see
// .agents/handoffs/onda-4/01-para-04-tenant-ai-consent-model-pronto.md, resolving the earlier
// .agents/handoffs/onda-2/04-para-01-ai-consent-schema.md recommendation. Previously this lived
// on the generic tenant-scoped `Setting` table under the `ai_provider_consent` key; that
// mechanism was real and functional, not a stub, but the dedicated model gives proper typed
// audit columns (grantedAt, revokedAt, actor, consentVersion) instead of an opaque JSON blob.
//
// NOTE: tenants that granted/revoked consent via the old `Setting` mechanism before this change
// are NOT backfilled into `TenantAiConsent` here — see
// .agents/handoffs/onda-4/04-para-01-legacy-ai-consent-setting-backfill.md for that follow-up,
// opened for Agente 01 (schema/data owner) rather than migrated unilaterally.

export interface AiConsentRecord {
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  grantedByUserId: string | null;
}

const NO_CONSENT_RECORD: AiConsentRecord = {
  granted: false,
  grantedAt: null,
  revokedAt: null,
  grantedByUserId: null,
};

function toAiConsentRecord(row: {
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
  grantedByUserId: string | null;
}): AiConsentRecord {
  return {
    granted: row.granted,
    grantedAt: row.grantedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    grantedByUserId: row.grantedByUserId,
  };
}

export async function getAiConsent(tenantId: string): Promise<AiConsentRecord> {
  const row = await prisma.tenantAiConsent.findUnique({ where: { tenantId } });
  if (!row) return NO_CONSENT_RECORD;
  return toAiConsentRecord(row);
}

export async function grantAiConsent(tenantId: string, actorUserId: string): Promise<AiConsentRecord> {
  const grantedAt = new Date();
  const row = await prisma.tenantAiConsent.upsert({
    where: { tenantId },
    create: { tenantId, granted: true, grantedAt, grantedByUserId: actorUserId },
    update: { granted: true, grantedAt, revokedAt: null, grantedByUserId: actorUserId },
  });
  return toAiConsentRecord(row);
}

export async function revokeAiConsent(tenantId: string, actorUserId: string): Promise<AiConsentRecord> {
  const revokedAt = new Date();
  const row = await prisma.tenantAiConsent.upsert({
    where: { tenantId },
    create: { tenantId, granted: false, revokedAt, grantedByUserId: actorUserId },
    update: { granted: false, revokedAt, grantedByUserId: actorUserId },
  });
  return toAiConsentRecord(row);
}

export async function getBrandColor(tenantId: string | null) {
  if (!tenantId) return '#2563eb';
  const row = await settingRepository.findSetting(tenantId, null, 'brand_color');
  return (row?.value as string) ?? '#2563eb';
}

export function saveBrandColor(tenantId: string, color: string) {
  return settingRepository.upsertSetting(tenantId, null, 'brand_color', color);
}

export function resetBrandColor(tenantId: string) {
  return settingRepository.deleteSetting(tenantId, null, 'brand_color');
}
