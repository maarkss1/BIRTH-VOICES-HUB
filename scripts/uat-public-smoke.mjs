#!/usr/bin/env node
/* global fetch, AbortSignal */

import process from 'node:process';
import { URL } from 'node:url';

const baseUrl = (process.env.UAT_BASE_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const email = (process.env.UAT_EMAIL || '').trim();
const password = process.env.UAT_PASSWORD || '';

if (!baseUrl) {
  process.stderr.write('UAT_BASE_URL or PUBLIC_BASE_URL is required.\n');
  process.exit(1);
}

const parsed = new URL(baseUrl);
if (parsed.protocol !== 'https:' && process.env.ALLOW_HTTP_UAT !== 'true') {
  process.stderr.write('Public UAT requires HTTPS. Set ALLOW_HTTP_UAT=true only for local/staging smoke tests.\n');
  process.exit(1);
}

async function assertOk(response, label) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  process.stdout.write(`${label}: OK\n`);
  return response;
}

const health = await assertOk(await fetch(`${baseUrl}/api/health`, {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
}), 'Health endpoint');

const healthBody = await health.json();
if (!['ok', 'healthy'].includes(String(healthBody.status).toLowerCase())) {
  throw new Error(`Unexpected health status: ${healthBody.status}`);
}

if (!email && !password) {
  process.stdout.write('Auth smoke skipped because UAT_EMAIL/UAT_PASSWORD were not provided.\n');
  process.exit(0);
}
if (!email || !password) {
  throw new Error('Provide both UAT_EMAIL and UAT_PASSWORD, or neither.');
}

const origin = parsed.origin;
const login = await assertOk(await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: origin,
  },
  body: JSON.stringify({ email, password }),
  redirect: 'manual',
  signal: AbortSignal.timeout(15_000),
}), 'UAT login');

const setCookies = typeof login.headers.getSetCookie === 'function'
  ? login.headers.getSetCookie()
  : [login.headers.get('set-cookie')].filter(Boolean);
const cookieHeader = setCookies
  .map((entry) => String(entry).split(';', 1)[0])
  .filter(Boolean)
  .join('; ');

if (!cookieHeader) throw new Error('Login succeeded but no authentication cookie was returned.');

const me = await assertOk(await fetch(`${baseUrl}/api/auth/me`, {
  headers: { Accept: 'application/json', Cookie: cookieHeader },
  signal: AbortSignal.timeout(15_000),
}), 'Authenticated session');
const meBody = await me.json();
if (meBody.user?.email !== email) throw new Error('Authenticated user does not match UAT_EMAIL.');
if (!meBody.user?.tenantId) throw new Error('Authenticated UAT user is missing tenantId.');

await assertOk(await fetch(`${baseUrl}/api/workflow`, {
  headers: { Accept: 'application/json', Cookie: cookieHeader },
  signal: AbortSignal.timeout(15_000),
}), 'Tenant workflow read');

await assertOk(await fetch(`${baseUrl}/api/auth/logout`, {
  method: 'POST',
  headers: { Origin: origin, Cookie: cookieHeader },
  signal: AbortSignal.timeout(15_000),
}), 'UAT logout');

process.stdout.write('Public UAT smoke PASSED. No tenant data was created or modified.\n');
