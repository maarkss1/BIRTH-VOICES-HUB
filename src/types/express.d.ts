import { TokenPayload } from '../lib/auth-tokens.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      tenantId?: string;
      // Set only when this request was authenticated via an API key (as opposed to the JWT
      // cookie/Bearer flow) — see src/middlewares/index.ts#getAuthUser and
      // src/services/apiKeyService.ts#authenticateApiKey. Drives the per-key rate limit in
      // attachAuthIfPresent; absent (undefined) for JWT-authenticated requests.
      apiKeyId?: string;
    }
  }
}

export {};
