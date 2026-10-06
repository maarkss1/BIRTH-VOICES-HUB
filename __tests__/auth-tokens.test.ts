import crypto from 'crypto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../src/lib/auth-tokens.js';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test_refresh_secret';
});

describe('Password hashing', () => {
  it('hashes a password and verifies it correctly', () => {
    const hash = hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hash = hashPassword('correct-horse-battery-staple');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('returns false for an empty stored hash instead of throwing', () => {
    expect(verifyPassword('anything', '')).toBe(false);
  });

  describe('PBKDF2 fallback for legacy passwords', () => {
    const legacyHash = 'test-salt:5d8f3c7af30ccfd1307a800f7eb9edce860a7d71334874d12a3da4df0cfda84f1d79709ce281f3c820d17b754145f702ed68aa5f8b48adac4cff5ca051f8b45e';

    it('verifies a legacy password correctly', () => {
      expect(verifyPassword('my-legacy-password', legacyHash)).toBe(true);
    });

    it('rejects an incorrect legacy password', () => {
      expect(verifyPassword('wrong-password', legacyHash)).toBe(false);
    });

    it('handles errors during PBKDF2 verification gracefully', () => {
      // Passing undefined password triggers an error in crypto.pbkdf2Sync, hitting the catch block
      expect(verifyPassword(undefined as unknown as string, legacyHash)).toBe(false);
    });
  });

  describe('bcrypt errors', () => {
    it('handles errors during bcrypt comparison gracefully', () => {
      // Passing undefined password triggers an error in bcrypt.compareSync, hitting the catch block
      expect(verifyPassword(undefined as unknown as string, 'not-empty-hash-without-colon')).toBe(false);
    });
  });
});

describe('Access tokens', () => {
  const payload = { id: 'user-1', email: 'user@example.com', role: 'admin', tenantId: 'tenant-1' };

  it('round-trips a valid token', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).toEqual(payload);
  });

  it('rejects a tampered token', () => {
    const token = generateToken(payload);
    const tampered = token.slice(0, -2) + 'xx';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(verifyToken('')).toBeNull();
  });


  it('rejects an expired token', () => {

    vi.useFakeTimers();
    try {
      const token = generateToken(payload); // payload will be signed with now + 900

      // Advance time by 901 seconds
      vi.advanceTimersByTime(901 * 1000);

      expect(verifyToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });


  it('rejects a token with invalid JSON payload', () => {
    // A token with a valid signature but invalid JSON in the body.
    // Let's create one dynamically using crypto.

    const secret = process.env.JWT_SECRET || 'test_jwt_secret';

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    // 'invalid-json' encoded in base64url is 'aW52YWxpZC1qc29u'
    const body = Buffer.from('invalid-json').toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');

    const token = header + '.' + body + '.' + signature;
    expect(verifyToken(token)).toBeNull();
  });

  it('does not accept a refresh token as an access token', () => {
    const refreshToken = generateRefreshToken({ id: 'user-1' });
    // Different secret/shape entirely — verifying it as an access token must fail closed.
    expect(verifyToken(refreshToken)).toBeNull();
  });
});

describe('Refresh tokens', () => {
  it('round-trips a valid refresh token', () => {
    const token = generateRefreshToken({ id: 'user-1' });
    expect(verifyRefreshToken(token)).toEqual({ id: 'user-1' });
  });

  it('rejects a tampered refresh token', () => {
    const token = generateRefreshToken({ id: 'user-1' });
    const tampered = token.slice(0, -2) + 'zz';
    expect(verifyRefreshToken(tampered)).toBeNull();
  });
});

describe('Secret configuration', () => {
  it('throws instead of silently signing when JWT_SECRET is unset', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => generateToken({ id: 'x', email: 'x@example.com', role: 'user', tenantId: 't' })).toThrow();
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});
