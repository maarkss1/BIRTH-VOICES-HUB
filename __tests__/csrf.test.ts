import { describe, it, expect, vi, afterEach } from 'vitest';
import { csrfProtection } from '../src/middlewares/index.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(method: string, headers: Record<string, string>) {
  const req = {
    method,
    headers,
  } as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('CSRF Protection Middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('allows safe methods', () => {
    const { req, res, next } = mockReqRes('GET', {});
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows Bearer token requests', () => {
    const { req, res, next } = mockReqRes('POST', {
      authorization: 'Bearer 12345',
    });
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks cross-origin in dev currently if origin is attacker.com', () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next } = mockReqRes('POST', {
      origin: 'http://attacker.com',
      host: 'localhost:3000',
    });
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
