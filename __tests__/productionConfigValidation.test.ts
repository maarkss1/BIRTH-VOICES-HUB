import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve(process.cwd(), 'scripts/validate-production-config.mjs');

function validEnv(overrides: Record<string, string> = {}) {
  return {
    ...process.env,
    GCP_PROJECT_ID: 'birth-voices-prod',
    GCP_SA_KEY: '{"type":"service_account"}',
    GCP_CREDENTIALS: '',
    PRODUCTION_DATABASE_URL: 'postgresql://user:pass@db.internal:5432/birthvoices',
    PRODUCTION_REDIS_URL: 'rediss://redis.internal:6379',
    JWT_SECRET: 'j'.repeat(48),
    REFRESH_TOKEN_SECRET: 'r'.repeat(48),
    GEMINI_API_KEY: 'g'.repeat(32),
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 't'.repeat(32),
    TWILIO_FROM_NUMBER: '+5511999998888',
    WEBHOOK_SIGNING_SECRET: 'w'.repeat(48),
    PUBLIC_BASE_URL: 'https://voice.example.com',
    ALLOWED_ORIGINS: 'https://voice.example.com',
    BLAND_API_KEY: '',
    BLAND_WEBHOOK_TOKEN: '',
    BLAND_RECORD_CALLS: 'false',
    BLAND_RECORDING_APPROVED: 'false',
    ATLASGR_TENANT_ID: '',
    ATLASGR_BASE_URL: '',
    ATLASGR_WEBHOOK_SECRET: '',
    ...overrides,
  };
}

function run(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    env: validEnv(overrides),
    encoding: 'utf8',
  });
}

describe('production configuration validator', () => {
  it('accepts a structurally safe core production configuration', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Production configuration validation passed');
  });

  it('rejects reused access and refresh token secrets', () => {
    const shared = 's'.repeat(48);
    const result = run({ JWT_SECRET: shared, REFRESH_TOKEN_SECRET: shared });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET and REFRESH_TOKEN_SECRET must be different');
  });

  it('rejects call recording without an explicit approval gate', () => {
    const result = run({
      BLAND_API_KEY: 'b'.repeat(32),
      BLAND_WEBHOOK_TOKEN: 'x'.repeat(32),
      BLAND_RECORD_CALLS: 'true',
      BLAND_RECORDING_APPROVED: 'false',
      ATLASGR_TENANT_ID: 'tenant-prod',
      ATLASGR_BASE_URL: 'https://atlas.example.com',
      ATLASGR_WEBHOOK_SECRET: 'a'.repeat(48),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BLAND_RECORDING_APPROVED=true');
  });

  it('rejects localhost in public production origins', () => {
    const result = run({ PUBLIC_BASE_URL: 'https://localhost', ALLOWED_ORIGINS: 'https://localhost' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot point to localhost/loopback');
  });
});
