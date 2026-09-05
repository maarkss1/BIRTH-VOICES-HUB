import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { csrfProtection } from '../src/middlewares/index.js';
import { appPromise } from '../server.js';

// Covers the Bearer-token CSRF exemption added while resolving
// `.agents/handoffs/onda-1/06-para-00-csrf-bloqueia-webhooks-servidor-servidor.md` (see
// `.agents/handoffs/onda-1/00-para-08-teste-csrf-bearer-exemption.md`). A malicious page cannot
// attach an arbitrary `Authorization: Bearer ...` header to a cross-site request, so exempting
// Bearer-authenticated requests from the Origin check does not reopen CSRF for the
// cookie-authenticated browser path below.
function mockReqRes(headers: Record<string, string> = {}) {
  const req = { method: 'POST', headers } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('csrfProtection (unit)', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('rejects a mutating request with no Origin and no Bearer token in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/Validação de origem/i) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a Bearer-authenticated mutating request with no Origin, even in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes({ authorization: 'Bearer some.jwt.token' });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still rejects an Origin that diverges from Host in production, Bearer header or not', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes({
      origin: 'https://evil.example.com',
      host: 'birthvoices.example.com',
    });

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a mutating request when Origin matches Host in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes({
      origin: 'https://birthvoices.example.com',
      host: 'birthvoices.example.com',
    });

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not touch non-mutating methods (GET) regardless of headers', () => {
    const { res, next } = mockReqRes();
    const getReq = { method: 'GET', headers: {} } as unknown as Request;

    csrfProtection(getReq, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('AtlasGR webhook is reachable without an Origin header (integration)', () => {
  let app: Express;

  beforeAll(async () => {
    app = await appPromise;
  });

  it('never returns the CSRF rejection, with or without an Origin header', async () => {
    const withoutOrigin = await request(app).post('/api/webhook/atlasgr/outbound').send({});
    expect(withoutOrigin.status).not.toBe(403);
    expect(withoutOrigin.body?.error).not.toMatch(/Validação de origem/i);

    const withCrossOrigin = await request(app)
      .post('/api/webhook/atlasgr/outbound')
      .set('Origin', 'https://not-the-host.example.com')
      .send({});
    expect(withCrossOrigin.status).not.toBe(403);
    expect(withCrossOrigin.body?.error).not.toMatch(/Validação de origem/i);
  });
});
