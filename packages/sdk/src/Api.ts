/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface User {
  /** @format uuid */
  id?: string;
  /** @format email */
  email?: string;
  companyName?: string;
  role?: "admin" | "user";
  /** @format uuid */
  tenantId?: string;
  /** @format date-time */
  createdAt?: string;
}

/** The shape returned by `GET /auth/me`: the JWT's `TokenPayload` claims (`id`, `email`, `role`, `tenantId` — notably narrower than `User`, e.g. no `companyName`/`createdAt`) plus `permissions`, resolved live against the database rather than trusted from the token (see `src/controllers/auth.controller.ts`). `permissions` is UX-only information for the client to decide what to show — every permission-gated action is still enforced authoritatively server-side. */
export interface AuthenticatedUser {
  /** @format uuid */
  id?: string;
  /** @format email */
  email?: string;
  role?: "admin" | "user";
  /** @format uuid */
  tenantId?: string;
  /** Effective permission keys for the caller's role, resolved live (see `getPermissionsForRoleName`). */
  permissions?: string[];
}

export interface Organization {
  /** @format uuid */
  id?: string;
  name?: string;
  /** @format date-time */
  createdAt?: string;
}

/** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
export interface Workflow {
  id?: string;
  /** @format uuid */
  tenantId?: string;
  name?: string;
  version?: number;
  /** Only `POST /workflow/publish` can set this to `active`, and only after `ValidationEngine`/`validateRuntimeCompatibility` both pass server-side. Any subsequent edit demotes it back to `draft`. */
  status?: "draft" | "active" | "archived";
  nodes?: any[];
  edges?: any[];
  /** @format date-time */
  createdAt?: string;
  /** @format date-time */
  updatedAt?: string;
}

export interface WorkflowHistoryEntry {
  version?: number;
  name?: string;
  commitMessage?: string;
  /** @format date-time */
  createdAt?: string;
  authorId?: string;
}

export interface Agent {
  /** @format uuid */
  id?: string;
  name?: string;
  model?: string;
  /** Free-form agent config (voice/LLM parameters, `knowledge[]` documents, etc). */
  configuration?: object;
}

export interface KnowledgeDocument {
  id?: string;
  name?: string;
  keyword?: string;
  content?: string;
  /** @format int64 */
  addedAt?: number;
}

export interface RagTestResult {
  source?: string;
  confidence?: number;
  isUpToDate?: boolean;
  document?: string;
  version?: string;
  snippetUsed?: string;
  embeddingsScore?: number;
  /** Callers must branch on this field, never infer certainty from `confidence` alone (see `AGENTS.md`, Onda 2 mission item 4). */
  isLowConfidence?: boolean;
}

export interface CallLog {
  id?: string;
  /** @format uuid */
  tenantId?: string;
  contactName?: string;
  duration?: string;
  status?: "Concluído" | "Falhou";
  agent?: string;
  /** @format date-time */
  createdAt?: string;
}

export interface Session {
  id?: string;
  /** @format uuid */
  tenantId?: string;
  agentId?: string;
  channel?: string;
  status?: string;
  metadata?: object;
  /** @format date-time */
  createdAt?: string;
}

export interface Metric {
  id?: string;
  name?: string;
  value?: number;
  tags?: object;
  /** @format date-time */
  createdAt?: string;
}

/** Tenant-level consent to send data to external AI providers (LGPD, `AGENTS.md` §16). */
export interface AiConsent {
  granted?: boolean;
  /** @format date-time */
  grantedAt?: string | null;
  grantedByUserId?: string | null;
}

/** One entry from the tenant's audit trail (`writeAuditLog()` writes these; see `src/services/auditLogService.ts`). `action` is a free-form event code, not a closed enum — new call sites can introduce new values (e.g. `USER_CREATE_BY_ADMIN`, `USER_LOGIN`, `CALL_LOG_CREATE`) without a spec change. */
export interface AuditLogEntry {
  /** @format uuid */
  id?: string;
  /**
   * Id of the user who performed the action, if the action was user-initiated.
   * @format uuid
   */
  userId?: string | null;
  /**
   * Email of the acting user at read time, resolved via a join; `null` if the user no longer exists.
   * @format email
   */
  actorEmail?: string | null;
  /** Machine-readable event code (e.g. `USER_LOGIN`, `CALL_LOG_CREATE`). */
  action?: string;
  /** Free-form JSON payload specific to `action`. */
  details?: object | null;
  /** @format date-time */
  timestamp?: string;
}

/** Shape returned by `GET /developers/keys` and by the `apiKey` field of the revoke endpoints. Deliberately excludes the hash and the plaintext secret — see `src/repositories/apiKeyRepository.ts`'s `API_KEY_SAFE_SELECT`, which never fetches `keyHash` in the first place, so there is no code path here that could leak it even by accident. */
export interface ApiKeyMetadata {
  id?: string;
  name?: string;
  /** @format date-time */
  createdAt?: string;
  /**
   * Set on the key's first successful authenticated request; `null` if never used.
   * @format date-time
   */
  lastUsedAt?: string | null;
  /**
   * `null` means the key never expires.
   * @format date-time
   */
  expiresAt?: string | null;
  revoked?: boolean;
  /** @format date-time */
  revokedAt?: string | null;
}

/** A tenant's billing wallet and current plan. The whole object is `null` (not a fabricated zero-balance wallet) when the tenant has never been onboarded to billing — see `billingService.getWalletSummary`. */
export interface WalletSummary {
  /** @format uuid */
  tenantId?: string;
  balanceCents?: number;
  currency?: string;
  planId?: string | null;
  planName?: string | null;
  planStatus?: "inactive" | "active" | "past_due" | "canceled" | "trialing";
  /** @format date-time */
  currentPeriodEnd?: string | null;
}

export interface TransactionSummary {
  id?: string;
  type?: string;
  /** Signed — positive is a credit, negative is a debit. */
  amountCents?: number;
  balanceAfterCents?: number;
  status?: string;
  description?: string | null;
  /** @format date-time */
  createdAt?: string;
}

/** Global plan catalog entry — the same list for every tenant (per-tenant custom pricing is out of scope). */
export interface PlanOption {
  id?: string;
  slug?: string;
  name?: string;
  priceCents?: number;
  currency?: string;
  billingInterval?: string;
}

export interface NotificationSummary {
  id?: string;
  title?: string;
  message?: string;
  isRead?: boolean;
  /** @format date-time */
  createdAt?: string;
}

export interface ErrorResponse {
  error?: string;
  /** Machine-readable error code, present on some error paths (e.g. `TTS_HTTP_NOT_IMPLEMENTED`, `AI_PROVIDER_CONSENT_REQUIRED`). */
  code?: string;
  details?: string[];
  /** Present on `422` workflow-publish failures — verbatim `ValidationEngine` issues. */
  issues?: object[];
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "http://localhost:5001/api";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Birth Voices Hub API
 * @version 1.1.0
 * @baseUrl http://localhost:5001/api
 *
 * Enterprise API for managing multi-tenant workflows, AI agents, and voice interactions.
 *
 * This document is audited directly against `src/routes/**` and the controllers they mount — it is the contract as actually implemented, not an aspirational design. See `.agents/prompts/09-sdk-contratos-docs.md` for the audit process and `docs/AUDIT.md` for the project's living technical-debt record. Endpoints that exist but are not yet functional (e.g. `POST /tts`) are documented as such rather than omitted, so a client integrating against this spec does not have to rediscover the gap at runtime.
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  auth = {
    /**
     * No description
     *
     * @tags Auth
     * @name RegisterCreate
     * @summary Register a new tenant + admin user
     * @request POST:/auth/register
     */
    registerCreate: (
      data: {
        /** @format email */
        email: string;
        /** @minLength 6 */
        password: string;
        /** @minLength 2 */
        companyName: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          token?: string;
          refreshToken?: string;
          tenantId?: string;
          user?: User;
        },
        ErrorResponse
      >({
        path: `/auth/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name LoginCreate
     * @summary User Login
     * @request POST:/auth/login
     */
    loginCreate: (
      data: {
        /** @format email */
        email: string;
        password: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          token?: string;
          refreshToken?: string;
          tenantId?: string;
          user?: User;
        },
        ErrorResponse
      >({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name GetAuth
     * @summary Introspect the current session
     * @request GET:/auth/me
     * @secure
     */
    getAuth: (params: RequestParams = {}) =>
      this.request<
        {
          /** The shape returned by `GET /auth/me`: the JWT's `TokenPayload` claims (`id`, `email`, `role`, `tenantId` — notably narrower than `User`, e.g. no `companyName`/`createdAt`) plus `permissions`, resolved live against the database rather than trusted from the token (see `src/controllers/auth.controller.ts`). `permissions` is UX-only information for the client to decide what to show — every permission-gated action is still enforced authoritatively server-side. */
          user?: AuthenticatedUser;
        },
        ErrorResponse
      >({
        path: `/auth/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name LogoutCreate
     * @summary Clear the current session cookies
     * @request POST:/auth/logout
     */
    logoutCreate: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        any
      >({
        path: `/auth/logout`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name RefreshCreate
     * @summary Rotate the access token using a refresh token
     * @request POST:/auth/refresh
     */
    refreshCreate: (
      data?: {
        /** Refresh token. If omitted, the `refresh_token` cookie is used instead. */
        token?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          token?: string;
        },
        ErrorResponse
      >({
        path: `/auth/refresh`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  workflows = {
    /**
     * @description There is exactly one `Workflow` row per tenant today (single-flow model, not a collection) — this is `GET /workflow`, not `GET /workflows`.
     *
     * @tags Workflows
     * @name WorkflowList
     * @summary Get the tenant's workflow
     * @request GET:/workflow
     * @secure
     */
    workflowList: (params: RequestParams = {}) =>
      this.request<
        {
          workflow?: Workflow | null;
        },
        any
      >({
        path: `/workflow`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Workflows
     * @name WorkflowCreate
     * @summary Create/save the tenant's workflow
     * @request POST:/workflow
     * @secure
     */
    workflowCreate: (
      data: {
        name?: string;
        nodes?: any[];
        edges?: any[];
        commitMessage?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Editing `nodes`/`edges` demotes `status` back to `draft` if it was `active`.
     *
     * @tags Workflows
     * @name WorkflowUpdate
     * @summary Update the tenant's workflow
     * @request PUT:/workflow
     * @secure
     */
    workflowUpdate: (
      data: {
        name?: string;
        nodes?: any[];
        edges?: any[];
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Workflows
     * @name WorkflowDelete
     * @summary Delete the tenant's workflow
     * @request DELETE:/workflow
     * @secure
     */
    workflowDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/workflow`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Workflows
     * @name HistoryList
     * @summary List saved versions of the tenant's workflow
     * @request GET:/workflow/history
     * @secure
     */
    historyList: (params: RequestParams = {}) =>
      this.request<
        {
          history?: WorkflowHistoryEntry[];
        },
        any
      >({
        path: `/workflow/history`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Workflows
     * @name RestoreCreate
     * @summary Restore a previous workflow version
     * @request POST:/workflow/restore
     * @secure
     */
    restoreCreate: (
      data: {
        version: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/restore`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Workflows
     * @name DuplicateCreate
     * @summary Duplicate a workflow
     * @request POST:/workflow/duplicate
     * @secure
     */
    duplicateCreate: (
      data: {
        sourceId: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/duplicate`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description The only route that can set `Workflow.status = 'active'`. Runs `ValidationEngine` (structural graph validity) and `validateRuntimeCompatibility` (does the telephony runtime actually know how to execute every node in this graph) before publishing — see `docs/patterns/workflow-execution-contract.md`. This closes `AGENTS.md` blocker #13.
     *
     * @tags Workflows
     * @name PublishCreate
     * @summary Publish the tenant's workflow (flip status to `active`)
     * @request POST:/workflow/publish
     * @secure
     */
    publishCreate: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/publish`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  workflowCollaboration = {
    /**
     * No description
     *
     * @tags WorkflowCollaboration
     * @name CommentsCreate
     * @summary Add a comment to a workflow node
     * @request POST:/workflow/comments
     * @secure
     */
    commentsCreate: (
      data: {
        nodeId: string;
        text: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/comments`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags WorkflowCollaboration
     * @name CommentsResolveCreate
     * @summary Resolve a workflow comment
     * @request POST:/workflow/comments/resolve
     * @secure
     */
    commentsResolveCreate: (
      data: {
        commentId: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/comments/resolve`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags WorkflowCollaboration
     * @name LockCreate
     * @summary Lock a workflow node for exclusive editing
     * @request POST:/workflow/lock
     * @secure
     */
    lockCreate: (
      data: {
        nodeId: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/lock`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags WorkflowCollaboration
     * @name UnlockCreate
     * @summary Release a workflow node lock
     * @request POST:/workflow/unlock
     * @secure
     */
    unlockCreate: (
      data: {
        nodeId: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** `nodes`/`edges` are stored as Prisma `Json` and are intentionally untyped here — the real shape (`StudioNode`/`StudioEdge` per node type) is documented in `docs/patterns/workflow-execution-contract.md`, not duplicated in the OpenAPI schema, because it evolves independently of the HTTP contract. */
          workflow?: Workflow;
        },
        ErrorResponse
      >({
        path: `/workflow/unlock`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  callLogs = {
    /**
     * No description
     *
     * @tags CallLogs
     * @name CallLogsList
     * @summary List call logs for the tenant
     * @request GET:/call-logs
     * @secure
     */
    callLogsList: (params: RequestParams = {}) =>
      this.request<
        {
          callLogs?: CallLog[];
        },
        any
      >({
        path: `/call-logs`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags CallLogs
     * @name CallLogsCreate
     * @summary Create a call log entry
     * @request POST:/call-logs
     * @secure
     */
    callLogsCreate: (
      data: {
        contactName?: string;
        duration?: string;
        status?: "Concluído" | "Falhou";
        agent?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          log?: CallLog;
        },
        ErrorResponse
      >({
        path: `/call-logs`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags CallLogs
     * @name CallLogsUpdate
     * @summary Update a call log entry
     * @request PUT:/call-logs/{id}
     * @secure
     */
    callLogsUpdate: (
      id: string,
      data: {
        contactName?: string;
        duration?: string;
        status?: "Concluído" | "Falhou";
        agent?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          log?: CallLog;
        },
        ErrorResponse
      >({
        path: `/call-logs/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags CallLogs
     * @name CallLogsDelete
     * @summary Delete a call log entry
     * @request DELETE:/call-logs/{id}
     * @secure
     */
    callLogsDelete: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/call-logs/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  onboarding = {
    /**
     * No description
     *
     * @tags Onboarding
     * @name OnboardingList
     * @summary Get the current user's onboarding checklist
     * @request GET:/onboarding
     * @secure
     */
    onboardingList: (params: RequestParams = {}) =>
      this.request<
        {
          checklist?: Record<string, boolean>;
        },
        any
      >({
        path: `/onboarding`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Onboarding
     * @name OnboardingCreate
     * @summary Save the onboarding checklist
     * @request POST:/onboarding
     * @secure
     */
    onboardingCreate: (
      data: {
        checklist: Record<string, boolean>;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          checklist?: Record<string, boolean>;
        },
        ErrorResponse
      >({
        path: `/onboarding`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Onboarding
     * @name OnboardingUpdate
     * @summary Save the onboarding checklist (alias of POST)
     * @request PUT:/onboarding
     * @secure
     */
    onboardingUpdate: (
      data: {
        checklist: Record<string, boolean>;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          checklist?: Record<string, boolean>;
        },
        ErrorResponse
      >({
        path: `/onboarding`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Onboarding
     * @name OnboardingDelete
     * @summary Reset the onboarding checklist
     * @request DELETE:/onboarding
     * @secure
     */
    onboardingDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        any
      >({
        path: `/onboarding`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  brandColor = {
    /**
     * @description Public-ish read: uses `attachAuthIfPresent`, not `requireTenant` — resolves to the caller's tenant color if authenticated, otherwise returns the platform default. Does not require a session.
     *
     * @tags BrandColor
     * @name BrandColorList
     * @summary Get the tenant's brand color
     * @request GET:/brand-color
     */
    brandColorList: (params: RequestParams = {}) =>
      this.request<
        {
          brandColor?: string;
        },
        any
      >({
        path: `/brand-color`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags BrandColor
     * @name BrandColorCreate
     * @summary Set the tenant's brand color
     * @request POST:/brand-color
     * @secure
     */
    brandColorCreate: (
      data: {
        color: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          brandColor?: string;
        },
        ErrorResponse
      >({
        path: `/brand-color`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags BrandColor
     * @name BrandColorUpdate
     * @summary Set the tenant's brand color (alias of POST)
     * @request PUT:/brand-color
     * @secure
     */
    brandColorUpdate: (
      data: {
        color: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          brandColor?: string;
        },
        ErrorResponse
      >({
        path: `/brand-color`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags BrandColor
     * @name BrandColorDelete
     * @summary Reset the tenant's brand color to the platform default
     * @request DELETE:/brand-color
     * @secure
     */
    brandColorDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          /** @example "#2563eb" */
          brandColor?: string;
        },
        any
      >({
        path: `/brand-color`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  voiceRuntime = {
    /**
     * No description
     *
     * @tags VoiceRuntime
     * @name VoiceRuntimeList
     * @summary Get the tenant's voice runtime configuration
     * @request GET:/voice-runtime
     * @secure
     */
    voiceRuntimeList: (params: RequestParams = {}) =>
      this.request<
        {
          config?: object;
        },
        any
      >({
        path: `/voice-runtime`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags VoiceRuntime
     * @name VoiceRuntimeCreate
     * @summary Create the tenant's voice runtime configuration
     * @request POST:/voice-runtime
     * @secure
     */
    voiceRuntimeCreate: (
      data: {
        config: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          config?: object;
        },
        ErrorResponse
      >({
        path: `/voice-runtime`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags VoiceRuntime
     * @name VoiceRuntimeUpdate
     * @summary Update the tenant's voice runtime configuration
     * @request PUT:/voice-runtime
     * @secure
     */
    voiceRuntimeUpdate: (
      data: {
        config: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          config?: object;
        },
        ErrorResponse
      >({
        path: `/voice-runtime`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags VoiceRuntime
     * @name VoiceRuntimeDelete
     * @summary Reset the tenant's voice runtime configuration to defaults
     * @request DELETE:/voice-runtime
     * @secure
     */
    voiceRuntimeDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        any
      >({
        path: `/voice-runtime`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  voiceOutbound = {
    /**
     * @description Asks the telephony provider to dial `targetNumber` and hand the answered call to the given agent. Returns as soon as the call is queued — the conversation and its result happen afterwards, and the outcome is delivered via the `agent.call.ended` webhook (see `docs/webhooks/index.md`).
     *
     * @tags VoiceOutbound
     * @name OutboundCreate
     * @summary Place an Outbound Voice Call
     * @request POST:/voice/outbound
     * @secure
     */
    outboundCreate: (
      data: {
        /** @format uuid */
        agentId: string;
        /**
         * Destination number in E.164 format.
         * @example "+5511999998888"
         */
        targetNumber: string;
        /**
         * Free-form facts about who is being called. Values are available as `{{placeholder}}` substitutions in the agent's `outboundGreeting` and are echoed back on the `agent.call.ended` webhook for correlation.
         * @example {"name":"João","company":"Transportadora X","leadId":"ckv1234"}
         */
        context?: object;
        /**
         * Per-call destination for the `agent.call.ended` webhook, overriding the deployment-wide `WEBHOOK_URL`. Must be HTTPS in production and must not point at a private/reserved/loopback host (SSRF guard) — see `src/validators/index.ts`.
         * @format uri
         */
        callbackUrl?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** Correlates this call with the `agent.call.ended` webhook. */
          sessionId?: string;
          callSid?: string;
          /** @example "queued" */
          status?: string;
        },
        ErrorResponse
      >({
        path: `/voice/outbound`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  metrics = {
    /**
     * No description
     *
     * @tags Metrics
     * @name MetricsList
     * @summary List metrics for the tenant
     * @request GET:/metrics
     * @secure
     */
    metricsList: (params: RequestParams = {}) =>
      this.request<
        {
          metrics?: Metric[];
        },
        any
      >({
        path: `/metrics`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Metrics
     * @name MetricsCreate
     * @summary Record a metric
     * @request POST:/metrics
     * @secure
     */
    metricsCreate: (
      data: {
        name: string;
        value: number;
        tags?: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          metric?: Metric;
        },
        ErrorResponse
      >({
        path: `/metrics`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Metrics
     * @name MetricsUpdate
     * @summary Not implemented — consolidated metrics cannot be edited directly
     * @request PUT:/metrics
     * @secure
     */
    metricsUpdate: (params: RequestParams = {}) =>
      this.request<any, ErrorResponse>({
        path: `/metrics`,
        method: "PUT",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Metrics
     * @name MetricsDelete
     * @summary Clear metrics for the tenant
     * @request DELETE:/metrics
     * @secure
     */
    metricsDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        any
      >({
        path: `/metrics`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  sessions = {
    /**
     * No description
     *
     * @tags Sessions
     * @name SessionsList
     * @summary List sessions for the tenant
     * @request GET:/sessions
     * @secure
     */
    sessionsList: (params: RequestParams = {}) =>
      this.request<
        {
          sessions?: Session[];
        },
        any
      >({
        path: `/sessions`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Sessions
     * @name SessionsCreate
     * @summary Create a session
     * @request POST:/sessions
     * @secure
     */
    sessionsCreate: (
      data: {
        agentId?: string;
        channel?: string;
        metadata?: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          session?: Session;
        },
        ErrorResponse
      >({
        path: `/sessions`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Sessions
     * @name SessionsUpdate
     * @summary Update a session
     * @request PUT:/sessions/{id}
     * @secure
     */
    sessionsUpdate: (
      id: string,
      data: {
        status?: string;
        metadata?: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          session?: Session;
        },
        ErrorResponse
      >({
        path: `/sessions/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Sessions
     * @name SessionsDelete
     * @summary End and remove a session
     * @request DELETE:/sessions/{id}
     * @secure
     */
    sessionsDelete: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/sessions/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  settings = {
    /**
     * No description
     *
     * @tags Settings
     * @name SettingsList
     * @summary Get the current user's settings
     * @request GET:/settings
     * @secure
     */
    settingsList: (params: RequestParams = {}) =>
      this.request<
        {
          settings?: object;
        },
        any
      >({
        path: `/settings`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Settings
     * @name SettingsCreate
     * @summary Create the current user's settings
     * @request POST:/settings
     * @secure
     */
    settingsCreate: (
      data: {
        settings: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          settings?: object;
        },
        ErrorResponse
      >({
        path: `/settings`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Settings
     * @name SettingsUpdate
     * @summary Update the current user's settings
     * @request PUT:/settings
     * @secure
     */
    settingsUpdate: (
      data: {
        settings: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          settings?: object;
        },
        ErrorResponse
      >({
        path: `/settings`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Settings
     * @name SettingsDelete
     * @summary Reset the current user's settings
     * @request DELETE:/settings
     * @secure
     */
    settingsDelete: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        any
      >({
        path: `/settings`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  agents = {
    /**
     * No description
     *
     * @tags Agents
     * @name AgentsList
     * @summary List Agents
     * @request GET:/agents
     * @secure
     */
    agentsList: (params: RequestParams = {}) =>
      this.request<
        {
          agents?: Agent[];
        },
        any
      >({
        path: `/agents`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Agents
     * @name AgentsCreate
     * @summary Create an Agent
     * @request POST:/agents
     * @secure
     */
    agentsCreate: (
      data: {
        name: string;
        model: string;
        configuration?: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          agent?: Agent;
        },
        ErrorResponse
      >({
        path: `/agents`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Agents
     * @name AgentsDetail
     * @summary Get an agent by id
     * @request GET:/agents/{id}
     * @secure
     */
    agentsDetail: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          agent?: Agent;
        },
        ErrorResponse
      >({
        path: `/agents/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Agents
     * @name AgentsDelete
     * @summary Delete an agent
     * @request DELETE:/agents/{id}
     * @secure
     */
    agentsDelete: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
        },
        any
      >({
        path: `/agents/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Agents
     * @name ConfigUpdate
     * @summary Update an agent's configuration
     * @request PUT:/agents/{id}/config
     * @secure
     */
    configUpdate: (id: string, data: object, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          agent?: Agent;
        },
        ErrorResponse
      >({
        path: `/agents/${id}/config`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  knowledge = {
    /**
     * @description Appends to `AgentConfiguration.knowledge[]`. There is no vector database behind this today — matching is a keyword-based simulation, see `POST /agents/{id}/rag/test` and `docs/ai/index.md`.
     *
     * @tags Knowledge
     * @name KnowledgeCreate
     * @summary Add a document to an agent's knowledge base
     * @request POST:/agents/{id}/knowledge
     * @secure
     */
    knowledgeCreate: (
      id: string,
      data: {
        agentId: string;
        name: string;
        keyword: string;
        content: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/agents/${id}/knowledge`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description In-memory keyword simulation (`KnowledgeConfidenceEngine`), not a real vector search — see `docs/ai/index.md` for the current state of RAG on this platform.
     *
     * @tags Knowledge
     * @name RagTestCreate
     * @summary Test a RAG query against an agent's knowledge base
     * @request POST:/agents/{id}/rag/test
     * @secure
     */
    ragTestCreate: (
      id: string,
      data: {
        agentId: string;
        query: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          result?: RagTestResult;
        },
        ErrorResponse
      >({
        path: `/agents/${id}/rag/test`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  organizations = {
    /**
     * @description Returns a single-element array with the caller's own tenant — there is no cross-tenant organization listing today.
     *
     * @tags Organizations
     * @name OrganizationsList
     * @summary List organizations visible to the caller
     * @request GET:/organizations
     * @secure
     */
    organizationsList: (params: RequestParams = {}) =>
      this.request<
        {
          organizations?: Organization[];
        },
        any
      >({
        path: `/organizations`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  users = {
    /**
     * @description Requires the `admin` role.
     *
     * @tags Users
     * @name UsersList
     * @summary List users in the tenant
     * @request GET:/users
     * @secure
     */
    usersList: (params: RequestParams = {}) =>
      this.request<
        {
          users?: User[];
        },
        ErrorResponse
      >({
        path: `/users`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Requires the `admin` role.
     *
     * @tags Users
     * @name UsersCreate
     * @summary Create a user in the tenant
     * @request POST:/users
     * @secure
     */
    usersCreate: (
      data: {
        /** @format email */
        email: string;
        /** @minLength 6 */
        password: string;
        companyName?: string;
        role?: "admin" | "user";
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          user?: User;
        },
        ErrorResponse
      >({
        path: `/users`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Self-service on the caller's own account, or admin-on-behalf-of within the same tenant.
     *
     * @tags Users
     * @name UsersUpdate
     * @summary Update a user's profile
     * @request PUT:/users/{id}
     * @secure
     */
    usersUpdate: (
      id: string,
      data: {
        companyName?: string;
        role?: "admin" | "user";
        /** @minLength 6 */
        password?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/users/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Requires the `admin` role.
     *
     * @tags Users
     * @name UsersDelete
     * @summary Delete a user
     * @request DELETE:/users/{id}
     * @secure
     */
    usersDelete: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/users/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Irreversibly scrubs the account's personal data (email, company name, credential) instead of hiding the row — implements Art. 18, VI, Lei 13.709/2018. Self-service on the caller's own account, or admin-on-behalf-of within the same tenant; enforced inside the service layer, not just at the route.
     *
     * @tags Users
     * @name AnonymizeCreate
     * @summary LGPD data-subject erasure request
     * @request POST:/users/{id}/anonymize
     * @secure
     */
    anonymizeCreate: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          message?: string;
        },
        ErrorResponse
      >({
        path: `/users/${id}/anonymize`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  auditLog = {
    /**
     * @description Requires the `admin` role — same authorization level as `GET /users`, since audit entries can reveal sensitive operational history. Tenant-scoped and paginated; ordered newest-first.
     *
     * @tags AuditLog
     * @name AuditLogList
     * @summary List the tenant's audit trail
     * @request GET:/audit-log
     * @secure
     */
    auditLogList: (
      query?: {
        /**
         * 1-based page number. Non-numeric or out-of-range values fall back to `1`.
         * @min 1
         * @default 1
         */
        page?: number;
        /**
         * Entries per page, clamped to `[1, 100]`. Non-numeric values fall back to the default.
         * @min 1
         * @max 100
         * @default 20
         */
        pageSize?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          items?: AuditLogEntry[];
          page?: number;
          pageSize?: number;
          total?: number;
          totalPages?: number;
        },
        ErrorResponse
      >({
        path: `/audit-log`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  apiKeys = {
    /**
     * @description Admin-only, tenant-scoped (`requireTenant` + `requireRole(['admin'])` — same authorization level as `/users` and `/billing/*`; a leaked or over-issued key is a security incident, not a routine self-service action for every role). The plaintext `key` in the `201` response is present **exactly once, only in this response** — it is SHA-256 hashed before being persisted and can never be retrieved again afterwards. If the caller loses it, the only remedy is to revoke this key and create a new one.
     *
     * @tags ApiKeys
     * @name KeysCreate
     * @summary Create a new tenant API key
     * @request POST:/developers/keys
     * @secure
     */
    keysCreate: (
      data: {
        /**
         * Human-readable label for the key (e.g. "CI pipeline", "Zapier integration").
         * @minLength 1
         * @maxLength 200
         */
        name: string;
        /**
         * Optional ISO 8601 expiration. Omitted/absent means the key never expires.
         * @format date-time
         */
        expiresAt?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          apiKey?: {
            id?: string;
            name?: string;
            /** @format date-time */
            createdAt?: string;
            /** @format date-time */
            expiresAt?: string | null;
          };
          /**
           * Plaintext secret. Present only in this response — not stored anywhere in recoverable form, never logged, never returned by `GET /developers/keys` or any other endpoint.
           * @example "bvhk_live_9f2c..."
           */
          key?: string;
        },
        ErrorResponse
      >({
        path: `/developers/keys`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Admin-only. Metadata only — never includes the hash or the plaintext key.
     *
     * @tags ApiKeys
     * @name KeysList
     * @summary List the tenant's API keys
     * @request GET:/developers/keys
     * @secure
     */
    keysList: (params: RequestParams = {}) =>
      this.request<
        {
          apiKeys?: ApiKeyMetadata[];
        },
        ErrorResponse
      >({
        path: `/developers/keys`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Admin-only. Alias of `POST /developers/keys/{id}/revoke` — same controller, same audit action (`API_KEY_REVOKE`). Tenant-scoped lookup: a key belonging to another tenant is indistinguishable from a nonexistent one (`404`). Idempotent — revoking an already-revoked key returns `200` rather than an error.
     *
     * @tags ApiKeys
     * @name KeysDelete
     * @summary Revoke an API key
     * @request DELETE:/developers/keys/{id}
     * @secure
     */
    keysDelete: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          /** Shape returned by `GET /developers/keys` and by the `apiKey` field of the revoke endpoints. Deliberately excludes the hash and the plaintext secret — see `src/repositories/apiKeyRepository.ts`'s `API_KEY_SAFE_SELECT`, which never fetches `keyHash` in the first place, so there is no code path here that could leak it even by accident. */
          apiKey?: ApiKeyMetadata;
        },
        ErrorResponse
      >({
        path: `/developers/keys/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Identical behavior to `DELETE /developers/keys/{id}` — provided for callers/UIs that prefer an explicit action verb over the `DELETE` HTTP method.
     *
     * @tags ApiKeys
     * @name KeysRevokeCreate
     * @summary Revoke an API key (explicit-verb alias)
     * @request POST:/developers/keys/{id}/revoke
     * @secure
     */
    keysRevokeCreate: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          /** Shape returned by `GET /developers/keys` and by the `apiKey` field of the revoke endpoints. Deliberately excludes the hash and the plaintext secret — see `src/repositories/apiKeyRepository.ts`'s `API_KEY_SAFE_SELECT`, which never fetches `keyHash` in the first place, so there is no code path here that could leak it even by accident. */
          apiKey?: ApiKeyMetadata;
        },
        ErrorResponse
      >({
        path: `/developers/keys/${id}/revoke`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  billing = {
    /**
     * @description Admin-only. `wallet: null` is a real, explicit empty state (tenant never onboarded to billing, no `Wallet` row yet) — not an error; render it as an empty state, never a fabricated zero-balance wallet.
     *
     * @tags Billing
     * @name SummaryList
     * @summary Wallet balance and current plan
     * @request GET:/billing/summary
     * @secure
     */
    summaryList: (params: RequestParams = {}) =>
      this.request<
        {
          wallet?: WalletSummary | null;
        },
        ErrorResponse
      >({
        path: `/billing/summary`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Admin-only. Tenant-scoped (`req.tenantId`, never a query param), ordered newest-first.
     *
     * @tags Billing
     * @name TransactionsList
     * @summary Paginated transaction history
     * @request GET:/billing/transactions
     * @secure
     */
    transactionsList: (
      query?: {
        /**
         * 1-based page number. Non-numeric or out-of-range values fall back to `1`.
         * @min 1
         * @default 1
         */
        page?: number;
        /**
         * Entries per page, clamped to `[1, 100]`. Non-numeric values fall back to the default.
         * @min 1
         * @max 100
         * @default 20
         */
        pageSize?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          items?: TransactionSummary[];
          page?: number;
          pageSize?: number;
          total?: number;
          totalPages?: number;
        },
        ErrorResponse
      >({
        path: `/billing/transactions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Any authenticated tenant member — not admin-gated, unlike the other `/billing/*` endpoints, since this is a read-only global catalog (same list for every tenant), not tenant-specific data.
     *
     * @tags Billing
     * @name PlansList
     * @summary List available subscription plans
     * @request GET:/billing/plans
     * @secure
     */
    plansList: (params: RequestParams = {}) =>
      this.request<
        {
          plans?: PlanOption[];
        },
        ErrorResponse
      >({
        path: `/billing/plans`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Admin-only. Only `effectiveAt: "immediate"` is implemented: `Wallet` has no `currentPeriodStart`, so there is no way to compute a prorated amount or a "next cycle" date — a request with `effectiveAt: "next_cycle"` gets an explicit `400` (`ProrationNotSupportedError`), never a silent fallback to immediate. On success, also raises an in-app notification for the acting admin (best-effort — a failure to notify never fails the plan change itself, which has already committed).
     *
     * @tags Billing
     * @name ChangePlanCreate
     * @summary Upgrade or downgrade the tenant's plan
     * @request POST:/billing/change-plan
     * @secure
     */
    changePlanCreate: (
      data: {
        planId: string;
        /**
         * `next_cycle` is accepted by the schema but rejected with `400` — see description above.
         * @default "immediate"
         */
        effectiveAt?: "immediate" | "next_cycle";
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          /** A tenant's billing wallet and current plan. The whole object is `null` (not a fabricated zero-balance wallet) when the tenant has never been onboarded to billing — see `billingService.getWalletSummary`. */
          wallet?: WalletSummary;
        },
        ErrorResponse
      >({
        path: `/billing/change-plan`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  notifications = {
    /**
     * @description Scoped to `req.user.id` (never a query/body param) — not admin-gated, unlike `/billing/*` and `/developers/keys`: any authenticated tenant member reads and manages only their own notifications. Includes `unreadCount` for the bell-badge UI.
     *
     * @tags Notifications
     * @name NotificationsList
     * @summary Paginated notification feed for the caller
     * @request GET:/notifications
     * @secure
     */
    notificationsList: (
      query?: {
        /**
         * 1-based page number. Non-numeric or out-of-range values fall back to `1`.
         * @min 1
         * @default 1
         */
        page?: number;
        /**
         * Entries per page, clamped to `[1, 100]`. Non-numeric values fall back to the default.
         * @min 1
         * @max 100
         * @default 20
         */
        pageSize?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          items?: NotificationSummary[];
          unreadCount?: number;
          page?: number;
          pageSize?: number;
          total?: number;
          totalPages?: number;
        },
        ErrorResponse
      >({
        path: `/notifications`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Ownership is verified against `req.user.id` inside the service/repository layer; a notification belonging to another user resolves to the same `404` as one that does not exist at all — never reveals that a resource exists in someone else's account.
     *
     * @tags Notifications
     * @name ReadCreate
     * @summary Mark one notification as read
     * @request POST:/notifications/{id}/read
     * @secure
     */
    readCreate: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          notification?: NotificationSummary;
        },
        ErrorResponse
      >({
        path: `/notifications/${id}/read`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Bulk action for the notification panel's header ("mark all as read").
     *
     * @tags Notifications
     * @name ReadAllCreate
     * @summary Mark all of the caller's notifications as read
     * @request POST:/notifications/read-all
     * @secure
     */
    readAllCreate: (params: RequestParams = {}) =>
      this.request<
        {
          updatedCount?: number;
        },
        ErrorResponse
      >({
        path: `/notifications/read-all`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  ai = {
    /**
     * @description Routed through `LLMGateway.processRequest`, which performs the tenant-scoped AI-provider consent check and provider failover chain (preferred provider → Gemini as guaranteed fallback) — the same gateway every other AI-Gateway caller uses.
     *
     * @tags AI
     * @name ChatCreate
     * @summary Send a message to the AI Gateway (Playground)
     * @request POST:/chat
     * @secure
     */
    chatCreate: (
      data: {
        /** Optional system prompt override. */
        prompt?: string;
        currentMessages: {
          role: "user" | "agent";
          text: string;
        }[];
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          text?: string;
          providerUsed?: "GoogleGemini" | "OpenAI" | "Claude" | "NONE";
          latencyMs?: number;
          tokensUsed?: number;
          costUSD?: number;
          fromFallback?: boolean;
          /** Present (`true`) only when tenant AI-provider consent has not been granted. */
          blockedByConsent?: boolean;
        },
        ErrorResponse
      >({
        path: `/chat`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Deliberately fails closed with `501` — previously this endpoint returned an empty audio payload with `200`, which made callers believe synthesis had succeeded. Phone-call speech synthesis goes through the voice runtime (`lib/voice-runtime/**`), not this HTTP endpoint.
     *
     * @tags AI
     * @name PostAi
     * @summary HTTP text-to-speech (not implemented)
     * @request POST:/tts
     * @secure
     */
    postAi: (data?: object, params: RequestParams = {}) =>
      this.request<any, ErrorResponse>({
        path: `/tts`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly (not via `LLMGateway`) — requires `GEMINI_API_KEY` to be configured, and requires tenant AI-provider consent (see `POST /ai/consent`).
     *
     * @tags AI
     * @name GenerateMusicCreate
     * @summary Generate music via Gemini (Lyria)
     * @request POST:/generate-music
     * @secure
     */
    generateMusicCreate: (
      data: {
        prompt: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          audioBase64?: string;
          mimeType?: string;
        },
        ErrorResponse
      >({
        path: `/generate-music`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly. Requires tenant AI-provider consent.
     *
     * @tags AI
     * @name GenerateVideoCreate
     * @summary Start a video generation job via Gemini (Veo)
     * @request POST:/generate-video
     * @secure
     */
    generateVideoCreate: (
      data: {
        prompt: string;
        /** Base64-encoded seed image, optional. */
        imageBytes?: string;
        mimeType?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          operationName?: string;
        },
        ErrorResponse
      >({
        path: `/generate-video`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly. Requires tenant AI-provider consent.
     *
     * @tags AI
     * @name VideoStatusCreate
     * @summary Poll a video generation job's status
     * @request POST:/video-status
     * @secure
     */
    videoStatusCreate: (
      data: {
        operationName: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          done?: boolean;
          error?: object | null;
        },
        ErrorResponse
      >({
        path: `/video-status`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly. Requires tenant AI-provider consent. Streams `video/mp4`.
     *
     * @tags AI
     * @name VideoDownloadList
     * @summary Download a finished generated video
     * @request GET:/video-download
     * @secure
     */
    videoDownloadList: (
      query: {
        operationName: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<Blob, void>({
        path: `/video-download`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly with a fixed prompt per `mode`. Requires tenant AI-provider consent. Returns the same `nodes` shape it received, with `data.label`/`data.config` rewritten by the model — this is a Studio editing aid, not a validated write to `Workflow.nodes` (the client must still call `PUT /workflow` to persist it).
     *
     * @tags AI
     * @name RefactorCreate
     * @summary AI-refactor a set of workflow nodes
     * @request POST:/ai/refactor
     * @secure
     */
    refactorCreate: (
      data: {
        mode: "simplify" | "reduceCost" | "reduceLatency" | "moreHuman";
        nodes: any[];
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          nodes?: any[];
        },
        ErrorResponse
      >({
        path: `/ai/refactor`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Calls `GoogleGenAI` directly with a fixed system prompt describing all 12 Studio node types. Requires tenant AI-provider consent. The returned graph is a Studio editing aid — it is not validated against `ValidationEngine`/runtime capability until the client saves and publishes it (`POST /workflow`, `POST /workflow/publish`); several of the documented node types are rejected at publish time today, see `docs/patterns/workflow-execution-contract.md`.
     *
     * @tags AI
     * @name GenerateWorkflowCreate
     * @summary Generate a full workflow graph from a natural-language prompt
     * @request POST:/ai/generate-workflow
     * @secure
     */
    generateWorkflowCreate: (
      data: {
        prompt: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          nodes?: any[];
          edges?: any[];
        },
        ErrorResponse
      >({
        path: `/ai/generate-workflow`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name ConsentList
     * @summary Get the tenant's AI-provider consent status
     * @request GET:/ai/consent
     * @secure
     */
    consentList: (params: RequestParams = {}) =>
      this.request<
        {
          /** Tenant-level consent to send data to external AI providers (LGPD, `AGENTS.md` §16). */
          consent?: AiConsent;
        },
        any
      >({
        path: `/ai/consent`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name ConsentCreate
     * @summary Grant or revoke the tenant's AI-provider consent
     * @request POST:/ai/consent
     * @secure
     */
    consentCreate: (
      data: {
        granted: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** Tenant-level consent to send data to external AI providers (LGPD, `AGENTS.md` §16). */
          consent?: AiConsent;
        },
        ErrorResponse
      >({
        path: `/ai/consent`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  observability = {
    /**
     * @description Always filtered by the authenticated caller's own `tenantId` inside the collector — `requireTenant` alone only proves the caller is authenticated for *some* tenant, not that they own the data returned.
     *
     * @tags Observability
     * @name MetricsList
     * @summary Get OpenTelemetry spans/metrics collected for the tenant
     * @request GET:/observability/metrics
     * @secure
     */
    metricsList: (params: RequestParams = {}) =>
      this.request<
        {
          spans?: object[];
          metrics?: object[];
        },
        any
      >({
        path: `/observability/metrics`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  telephony = {
    /**
     * @description Twilio-signed webhook (`X-Twilio-Signature`, validated against `PUBLIC_BASE_URL` + `TWILIO_AUTH_TOKEN`), not a session-authenticated route — not for direct SDK use. Body is `application/x-www-form-urlencoded`, Twilio's standard call-status payload.
     *
     * @tags Telephony
     * @name TwilioVoiceCreate
     * @summary Twilio inbound call webhook
     * @request POST:/telephony/twilio/voice
     */
    twilioVoiceCreate: (data: object, params: RequestParams = {}) =>
      this.request<string, void>({
        path: `/telephony/twilio/voice`,
        method: "POST",
        body: data,
        type: ContentType.UrlEncoded,
        ...params,
      }),

    /**
     * @description Twilio-signed webhook. The session id travels in the query string (`?sessionId=...`), set when the call was queued.
     *
     * @tags Telephony
     * @name TwilioOutboundCreate
     * @summary Twilio TwiML webhook for a call placed via `POST /voice/outbound`
     * @request POST:/telephony/twilio/outbound
     */
    twilioOutboundCreate: (
      query: {
        sessionId: string;
      },
      data: object,
      params: RequestParams = {},
    ) =>
      this.request<string, void>({
        path: `/telephony/twilio/outbound`,
        method: "POST",
        query: query,
        body: data,
        type: ContentType.UrlEncoded,
        ...params,
      }),

    /**
     * @description Twilio-signed webhook.
     *
     * @tags Telephony
     * @name TwilioGatherCreate
     * @summary Twilio speech-gather webhook (one per conversation turn)
     * @request POST:/telephony/twilio/gather
     */
    twilioGatherCreate: (
      query: {
        sessionId: string;
      },
      data: object,
      params: RequestParams = {},
    ) =>
      this.request<string, void>({
        path: `/telephony/twilio/gather`,
        method: "POST",
        query: query,
        body: data,
        type: ContentType.UrlEncoded,
        ...params,
      }),

    /**
     * @description Twilio-signed webhook. Finalizes the call record and triggers the `agent.call.ended` webhook (see `docs/webhooks/index.md`).
     *
     * @tags Telephony
     * @name TwilioStatusCreate
     * @summary Twilio call-status callback (call ended)
     * @request POST:/telephony/twilio/status
     */
    twilioStatusCreate: (data: object, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/telephony/twilio/status`,
        method: "POST",
        body: data,
        type: ContentType.UrlEncoded,
        ...params,
      }),
  };
  webhooks = {
    /**
     * @description Server-to-server webhook, authenticated by a pre-shared secret (`X-AtlasGR-Webhook-Secret` header, compared against `ATLASGR_WEBHOOK_SECRET`) rather than a user session — mounted before CSRF protection. Idempotent per the underlying call request (`AGENTS.md` blocker #11).
     *
     * @tags Webhooks
     * @name AtlasgrOutboundCreate
     * @summary AtlasGR CRM → trigger an outbound prospecting call
     * @request POST:/webhook/atlasgr/outbound
     */
    atlasgrOutboundCreate: (
      data: {
        /**
         * @minLength 8
         * @maxLength 20
         * @example "+5511999998888"
         */
        phone_number: string;
        /** @maxLength 200 */
        name: string;
        /** @maxLength 200 */
        company: string;
        /**
         * Optional and additive — this route's original contract (owned by the sibling AtlasGR repository) did not have this field; it stays optional so a client on the old contract keeps working.
         * @maxLength 200
         */
        lead_id?: string;
        /**
         * @minLength 8
         * @maxLength 20
         */
        from?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, ErrorResponse>({
        path: `/webhook/atlasgr/outbound`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Server-to-server webhook. `{token}` is compared against `BLAND_WEBHOOK_TOKEN` (Bland AI's outbound-call API takes a plain callback URL with no custom-header support, so the shared secret travels in the path instead of a header). Idempotent per `call_id` (`AGENTS.md` blocker #11); forwards the result to AtlasGR (`ATLASGR_BASE_URL`/api/webhooks/voice-result`) once processed.
     *
     * @tags Webhooks
     * @name BlandCreate
     * @summary Bland AI → call-result callback
     * @request POST:/webhooks/bland/{token}
     */
    blandCreate: (
      token: string,
      data: {
        call_id: string;
        status?: string;
        to?: string;
        concatenated_transcript?: string;
        summary?: string;
        recording_url?: string;
        call_length?: number;
        completed?: boolean;
        variables?: Record<string, any>;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          received?: boolean;
          duplicate?: boolean;
        },
        void
      >({
        path: `/webhooks/bland/${token}`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  health = {
    /**
     * @description Also mounted without the `/api` prefix at the server root.
     *
     * @tags Health
     * @name HealthList
     * @summary Liveness/health check
     * @request GET:/health
     */
    healthList: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example "ok" */
          status?: string;
        },
        any
      >({
        path: `/health`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Health
     * @name LiveList
     * @summary Kubernetes/Cloud Run liveness probe
     * @request GET:/live
     */
    liveList: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example "ok" */
          status?: string;
        },
        any
      >({
        path: `/live`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Health
     * @name ReadyList
     * @summary Readiness probe (checks Postgres and Redis connectivity)
     * @request GET:/ready
     */
    readyList: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example "ready" */
          status?: string;
          checks?: {
            database?: "ok" | "error";
            redis?: "ok" | "error";
          };
        },
        {
          /** @example "not_ready" */
          status?: string;
          checks?: {
            database?: "ok" | "error";
            redis?: "ok" | "error";
          };
        }
      >({
        path: `/ready`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
}
