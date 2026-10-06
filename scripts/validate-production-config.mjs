#!/usr/bin/env node

import process from 'node:process';
import { URL } from 'node:url';

const env = process.env;
const errors = [];
const warnings = [];

const present = (name) => typeof env[name] === 'string' && env[name].trim().length > 0;
const value = (name) => (env[name] || '').trim();
const requireValue = (name) => {
  if (!present(name)) errors.push(`Missing required production setting: ${name}`);
};

const coreRequired = [
  'GCP_PROJECT_ID',
  'PRODUCTION_DATABASE_URL',
  'PRODUCTION_REDIS_URL',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'GEMINI_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'WEBHOOK_SIGNING_SECRET',
  'PUBLIC_BASE_URL',
  'ALLOWED_ORIGINS',
];

coreRequired.forEach(requireValue);
if (!present('GCP_SA_KEY') && !present('GCP_CREDENTIALS')) {
  errors.push('Missing required production setting: GCP_SA_KEY or GCP_CREDENTIALS');
}

function parseHttpsOrigin(name, raw, { allowPath = false } = {}) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${name} must be a valid absolute URL`);
    return null;
  }
  if (parsed.protocol !== 'https:') errors.push(`${name} must use HTTPS`);
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    errors.push(`${name} cannot point to localhost/loopback in production`);
  }
  if (!allowPath && parsed.pathname !== '/') errors.push(`${name} must be an origin without a path`);
  if (parsed.search || parsed.hash) errors.push(`${name} cannot contain query parameters or fragments`);
  return parsed;
}

const publicBase = parseHttpsOrigin('PUBLIC_BASE_URL', value('PUBLIC_BASE_URL'));

if (present('ALLOWED_ORIGINS')) {
  const origins = value('ALLOWED_ORIGINS').split(',').map((item) => item.trim()).filter(Boolean);
  if (origins.length === 0) errors.push('ALLOWED_ORIGINS must contain at least one HTTPS origin');
  for (const origin of origins) parseHttpsOrigin('ALLOWED_ORIGINS entry', origin);
  if (publicBase && !origins.includes(publicBase.origin)) {
    warnings.push('PUBLIC_BASE_URL origin is not present in ALLOWED_ORIGINS; confirm this is intentional');
  }
}

if (present('PRODUCTION_DATABASE_URL')) {
  const db = value('PRODUCTION_DATABASE_URL');
  if (!/^postgres(?:ql)?:\/\//i.test(db)) errors.push('PRODUCTION_DATABASE_URL must use postgres:// or postgresql://');
  if (/localhost|127\.0\.0\.1/i.test(db)) errors.push('PRODUCTION_DATABASE_URL cannot point to localhost in production');
}

if (present('PRODUCTION_REDIS_URL')) {
  const redis = value('PRODUCTION_REDIS_URL');
  if (!/^rediss?:\/\//i.test(redis)) errors.push('PRODUCTION_REDIS_URL must use redis:// or rediss://');
  if (/localhost|127\.0\.0\.1/i.test(redis)) errors.push('PRODUCTION_REDIS_URL cannot point to localhost in production');
}

if (present('JWT_SECRET') && value('JWT_SECRET').length < 32) errors.push('JWT_SECRET must be at least 32 characters');
if (present('REFRESH_TOKEN_SECRET') && value('REFRESH_TOKEN_SECRET').length < 32) errors.push('REFRESH_TOKEN_SECRET must be at least 32 characters');
if (present('JWT_SECRET') && present('REFRESH_TOKEN_SECRET') && value('JWT_SECRET') === value('REFRESH_TOKEN_SECRET')) {
  errors.push('JWT_SECRET and REFRESH_TOKEN_SECRET must be different values');
}
if (present('WEBHOOK_SIGNING_SECRET') && value('WEBHOOK_SIGNING_SECRET').length < 32) {
  errors.push('WEBHOOK_SIGNING_SECRET must be at least 32 characters');
}
if (present('TWILIO_AUTH_TOKEN') && value('TWILIO_AUTH_TOKEN').length < 20) errors.push('TWILIO_AUTH_TOKEN looks too short');
if (present('GEMINI_API_KEY') && value('GEMINI_API_KEY').length < 20) errors.push('GEMINI_API_KEY looks too short');
if (present('TWILIO_ACCOUNT_SID') && !/^AC[a-f0-9]{32}$/i.test(value('TWILIO_ACCOUNT_SID'))) {
  errors.push('TWILIO_ACCOUNT_SID must match the Twilio Account SID format');
}
if (present('TWILIO_FROM_NUMBER') && !/^\+[1-9]\d{7,14}$/.test(value('TWILIO_FROM_NUMBER'))) {
  errors.push('TWILIO_FROM_NUMBER must be E.164');
}
if (present('GCP_PROJECT_ID') && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value('GCP_PROJECT_ID'))) {
  errors.push('GCP_PROJECT_ID does not match the expected Google Cloud project-id format');
}

const atlasNames = [
  'BLAND_API_KEY',
  'BLAND_WEBHOOK_TOKEN',
  'ATLASGR_WEBHOOK_SECRET',
  'ATLASGR_TENANT_ID',
  'ATLASGR_BASE_URL',
];
const atlasEnabled = atlasNames.some(present) || value('BLAND_RECORD_CALLS').toLowerCase() === 'true';
if (atlasEnabled) {
  atlasNames.forEach(requireValue);
  parseHttpsOrigin('ATLASGR_BASE_URL', value('ATLASGR_BASE_URL'));
  if (present('BLAND_WEBHOOK_TOKEN') && value('BLAND_WEBHOOK_TOKEN').length < 24) errors.push('BLAND_WEBHOOK_TOKEN must be at least 24 characters');
  if (present('ATLASGR_WEBHOOK_SECRET') && value('ATLASGR_WEBHOOK_SECRET').length < 32) errors.push('ATLASGR_WEBHOOK_SECRET must be at least 32 characters');
}

if (value('BLAND_RECORD_CALLS').toLowerCase() === 'true' && value('BLAND_RECORDING_APPROVED').toLowerCase() !== 'true') {
  errors.push('BLAND_RECORD_CALLS=true requires BLAND_RECORDING_APPROVED=true after legal/privacy approval');
}

for (const warning of warnings) process.stderr.write(`::warning::${warning}\n`);

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`::error::${error}\n`);
  process.stderr.write(`Production configuration validation failed with ${errors.length} error(s).\n`);
  process.exit(1);
}

process.stdout.write('Production configuration validation passed. Secret values were not printed.\n');
