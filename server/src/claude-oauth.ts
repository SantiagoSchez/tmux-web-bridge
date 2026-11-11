import { createHash, randomBytes } from 'node:crypto';
import type { AccountUsage, UsageWindow } from '../../shared/types.js';

// Claude Code's own OAuth client: the logins the hub makes are the same kind
// `/login` makes, so the hub can hand them to any machine's Claude Code.
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.com/cai/oauth/authorize';
/** The page that shows the code to paste, instead of redirecting to a local server. */
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const API = 'https://api.anthropic.com';
const BETA = 'oauth-2025-04-20';
/** What `/login` asks for with a Claude subscription. */
const SCOPES = ['org:create_api_key', 'user:profile', 'user:inference', 'user:sessions:claude_code', 'user:mcp_servers', 'user:file_upload', 'user:plugins'];
/** What a refresh asks for: the same, without minting API keys (Claude Code does the same). */
const REFRESH_SCOPES = SCOPES.filter((s) => s !== 'org:create_api_key');
const UA = 'tmux-web-bridge';

/**
 * A Claude Code login, as it keeps it under `claudeAiOauth` in its credentials. Fields
 * it adds that the hub does not know of are kept as they are.
 */
export interface OAuthCred {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshTokenExpiresAt?: number;
  scopes: string[];
  subscriptionType?: string | null;
  rateLimitTier?: string | null;
  [key: string]: unknown;
}

/** An answer of Anthropic that is not a 2xx. */
export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds to wait, from Retry-After (429). */
    readonly retryAfter?: number,
    /** The refresh token is no longer valid: only a new login fixes it. */
    readonly deadGrant = false,
  ) {
    super(message);
  }
}

export interface PendingLogin {
  url: string;
  state: string;
  verifier: string;
}

/** A login started from the panel: the URL to open in the browser, with PKCE. */
export function startLogin(): PendingLogin {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return { url: url.toString(), state, verifier };
}

/** The code page shows "code#state"; only the code is sent. */
export function splitCode(pasted: string): { code: string; state?: string } {
  const [code, state] = pasted.trim().split('#');
  return { code: code.trim(), state: state?.trim() || undefined };
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let kind = '';
    try {
      kind = String((JSON.parse(text) as { error?: unknown }).error ?? '');
    } catch {
      /* not JSON */
    }
    throw new OAuthError(`Anthropic respondió ${res.status}${kind ? ` (${kind})` : ''}`, res.status, undefined, kind === 'invalid_grant');
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** What a token answer says, as Claude Code stores it, plus who it belongs to. */
function credFrom(data: Record<string, unknown>, previous?: OAuthCred): { cred: OAuthCred; accountUuid?: string; email?: string; orgUuid?: string; orgName?: string } {
  const now = Date.now();
  const expiresIn = Number(data.expires_in);
  const refreshIn = Number(data.refresh_token_expires_in);
  const cred: OAuthCred = {
    ...previous,
    accessToken: String(data.access_token),
    // A refresh may keep the same refresh token: then it does not come back.
    refreshToken: String(data.refresh_token ?? previous?.refreshToken ?? ''),
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    scopes: typeof data.scope === 'string' ? data.scope.split(' ').filter(Boolean) : (previous?.scopes ?? []),
  };
  if (Number.isFinite(refreshIn)) cred.refreshTokenExpiresAt = now + refreshIn * 1000;
  const account = data.account as { uuid?: string; email_address?: string } | undefined;
  const org = data.organization as { uuid?: string; name?: string } | undefined;
  return { cred, accountUuid: account?.uuid, email: account?.email_address, orgUuid: org?.uuid, orgName: org?.name };
}

/** Trades the pasted code for a login. */
export async function exchangeCode(pending: PendingLogin, code: string) {
  return credFrom(
    await post({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: pending.verifier, state: pending.state }),
  );
}

/**
 * A new access token for a login the hub holds. The refresh token works once: the
 * answer brings its successor, which must be kept before anything else happens.
 */
export async function refresh(cred: OAuthCred): Promise<OAuthCred> {
  return credFrom(await post({ grant_type: 'refresh_token', refresh_token: cred.refreshToken, client_id: CLIENT_ID, scope: REFRESH_SCOPES.join(' ') }), cred).cred;
}

async function get(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'anthropic-beta': BETA, 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const after = Number(res.headers.get('retry-after'));
    throw new OAuthError(`Anthropic respondió ${res.status}`, res.status, Number.isFinite(after) ? after : undefined);
  }
  return (await res.json()) as Record<string, unknown>;
}

function epoch(iso: unknown): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

function window(raw: unknown): UsageWindow | undefined {
  const w = raw as { utilization?: unknown; resets_at?: unknown } | null | undefined;
  if (!w || typeof w.utilization !== 'number') return undefined;
  return { pct: w.utilization, resetsAt: epoch(w.resets_at) };
}

/** The usage endpoint's answer, reduced to what the panel shows. Exported for the tests. */
export function parseUsage(data: Record<string, unknown>, t: number): AccountUsage {
  const usage: AccountUsage = { t, fiveHour: window(data.five_hour), sevenDay: window(data.seven_day), models: [] };
  const limits = Array.isArray(data.limits) ? (data.limits as Record<string, unknown>[]) : [];
  for (const l of limits) {
    const name = (l.scope as { model?: { display_name?: unknown } } | null)?.model?.display_name;
    if (l.kind !== 'weekly_scoped' || typeof name !== 'string' || typeof l.percent !== 'number') continue;
    usage.models.push({ name, pct: l.percent, resetsAt: epoch(l.resets_at) });
  }
  return usage;
}

/** 5 h, 7 d and the weekly limits per model of the login's account. */
export async function fetchUsage(accessToken: string): Promise<AccountUsage> {
  return parseUsage(await get('/api/oauth/usage', accessToken), Math.floor(Date.now() / 1000));
}

export interface Profile {
  accountUuid: string;
  email: string;
  orgUuid: string;
  orgName?: string;
  plan?: string;
  /** What Claude Code keeps of it in `oauthAccount` of `.claude.json`. */
  oauthAccount: Record<string, unknown>;
  subscriptionType?: string;
  rateLimitTier?: string;
}

const PLAN: Record<string, string> = { claude_max: 'Max', claude_pro: 'Pro', claude_team: 'Team', claude_enterprise: 'Enterprise' };
const SUBSCRIPTION: Record<string, string> = { claude_max: 'max', claude_pro: 'pro', claude_team: 'team', claude_enterprise: 'enterprise' };

/** "Max 5x", "Team"... from the organization's type and rate limit tier. */
export function planName(orgType: string | undefined, tier: string | undefined): string | undefined {
  const name = orgType ? PLAN[orgType] : undefined;
  if (name !== 'Max') return name;
  const x = /_(\d+x)$/.exec(tier ?? '')?.[1];
  return x ? `Max ${x}` : name;
}

/** Who a login belongs to, its organization and its plan. Exported for the tests. */
export function parseProfile(data: Record<string, unknown>): Profile {
  const a = (data.account ?? {}) as Record<string, unknown>;
  const o = (data.organization ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const orgType = str(o.organization_type);
  const tier = str(o.rate_limit_tier);
  const oauthAccount: Record<string, unknown> = {
    accountUuid: str(a.uuid),
    emailAddress: str(a.email) ?? str(a.email_address),
    organizationUuid: str(o.uuid),
    organizationName: str(o.name),
    displayName: str(a.display_name),
    fullName: str(a.full_name),
    billingType: str(o.billing_type),
    organizationType: orgType,
    organizationRateLimitTier: tier,
    seatTier: str(o.seat_tier),
    hasExtraUsageEnabled: typeof o.has_extra_usage_enabled === 'boolean' ? o.has_extra_usage_enabled : undefined,
    accountCreatedAt: str(a.created_at),
    subscriptionCreatedAt: str(o.subscription_created_at),
  };
  for (const k of Object.keys(oauthAccount)) if (oauthAccount[k] === undefined) delete oauthAccount[k];
  return {
    accountUuid: String(oauthAccount.accountUuid ?? ''),
    email: String(oauthAccount.emailAddress ?? ''),
    orgUuid: String(oauthAccount.organizationUuid ?? ''),
    orgName: str(o.name),
    plan: planName(orgType, tier),
    oauthAccount,
    subscriptionType: orgType ? SUBSCRIPTION[orgType] : undefined,
    rateLimitTier: tier,
  };
}

export async function fetchProfile(accessToken: string): Promise<Profile> {
  return parseProfile(await get('/api/oauth/profile', accessToken));
}
