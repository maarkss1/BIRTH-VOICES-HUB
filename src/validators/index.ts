import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(6, 'A senha precisa de no mínimo 6 caracteres'),
  companyName: z.string().min(2, 'Nome de empresa inválido'),
});

export const loginSchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const saveWorkflowSchema = z.object({
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

export const callLogSchema = z.object({
  contactName: z.string().optional(),
  duration: z.string().optional(),
  status: z.enum(['Concluído', 'Falhou']).optional(),
  agent: z.string().optional(),
});

export const sessionSchema = z.object({
  agentId: z.string().optional(),
  channel: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const voiceRuntimeSchema = z.object({ config: z.record(z.string(), z.any()) });
export const userSettingsSchema = z.object({ settings: z.record(z.string(), z.any()) });

export const brandColorSchema = z.object({ color: z.string().min(1) });

export const checklistSchema = z.object({ checklist: z.record(z.string(), z.boolean()) });

export const createUserSchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(6, 'A senha precisa de no mínimo 6 caracteres'),
  companyName: z.string().optional(),
  role: z.enum(['admin', 'user', 'supervisor']).optional(),
});

export const updateUserSchema = z.object({
  companyName: z.string().optional(),
  role: z.enum(['admin', 'user', 'supervisor']).optional(),
  password: z.string().min(6).optional(),
});

export const agentSchema = z.object({
  name: z.string().min(1, 'Nome do agente é obrigatório'),
  model: z.string().min(1, 'Modelo é obrigatório'),
  configuration: z.record(z.string(), z.any()).optional(),
});

export const metricSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  tags: z.record(z.string(), z.any()).optional(),
});

// The server POSTs to whatever callbackUrl a client supplies, so an unrestricted value here is an
// SSRF primitive. Requiring HTTPS blocks non-HTTP schemes outright and keeps call transcripts off
// the wire in the clear; plain http stays allowed outside production for local receivers.
// isPrivateOrReservedHost rejects literal loopback/private/link-local/cloud-metadata IPs and the
// `localhost` hostname family so a caller cannot point the webhook at internal infrastructure
// (e.g. 169.254.169.254 cloud metadata, 127.0.0.1, a service on the private VPC). This is a
// literal-IP check only — it does not resolve DNS, so a public hostname that resolves to a
// private address at request time is not caught here; tighten with an egress allowlist/proxy if
// untrusted tenants ever get API access and this residual DNS-rebinding gap needs closing too.
function isPrivateOrReservedHost(hostname: string): boolean {
  // Node's URL.hostname keeps the brackets for IPv6 literals (e.g. "[::1]") — strip them so the
  // IPv6 branch below matches against the bare address.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true;

  // IPv4 literal (including IPv4-mapped IPv6 forms like ::ffff:127.0.0.1)
  const ipv4Match = host.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  const ipv4 = ipv4Match ? ipv4Match[1] : (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : null);
  if (ipv4) {
    const octets = ipv4.split('.').map(Number);
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true; // malformed -> reject
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  // IPv6 literal (bracketed by URL parsing rules, hostname comes without brackets)
  if (host.includes(':')) {
    if (host === '::1') return true; // loopback
    if (host.startsWith('fe80:') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return true; // link-local fe80::/10
    if (host.startsWith('fc') || host.startsWith('fd')) return true; // unique local fc00::/7
    return false;
  }

  return false;
}

const callbackUrlSchema = z
  .string()
  .url('callbackUrl deve ser uma URL válida')
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
        return false;
      }
      return !isPrivateOrReservedHost(parsed.hostname);
    },
    { message: 'callbackUrl deve ser uma URL pública válida (HTTPS, sem apontar para rede interna/privada).' },
  );

export const outboundCallSchema = z.object({
  agentId: z.string().min(1, 'agentId é obrigatório'),
  // E.164. A CRM dialing a prospect list will inevitably send malformed numbers; rejecting them
  // here costs nothing, while Twilio rejects them after we have already created a session.
  targetNumber: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'targetNumber deve estar no formato E.164 (ex: +5511999998888)'),
  context: z.record(z.string(), z.any()).optional(),
  callbackUrl: callbackUrlSchema.optional(),
});
