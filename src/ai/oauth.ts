import { Platform, requestUrl } from "obsidian";
import type { IncomingMessage } from "http";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_BASE = "https://auth.openai.com";
const OPENAI_REDIRECT_URI = "http://localhost:1455/auth/callback";
const OPENAI_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
];

// Gemini OAuth defaults are inherited from google-gemini/gemini-cli — those
// credentials are deliberately published as an "installed application" client
// (Google's OAuth2 spec treats the secret as non-sensitive for desktop apps).
// Users may still override with their own GCP OAuth client via plugin settings
// for stronger isolation; if either BYO field is empty, defaults are used.
const GEMINI_CLI_CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const GEMINI_CLI_CLIENT_SECRET = "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";
const GEMINI_REDIRECT_URI = "http://localhost:8085/oauth2callback";
const GEMINI_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function resolveGeminiCredentials(byo: {
  clientId?: string;
  clientSecret?: string;
}): { clientId: string; clientSecret: string } {
  const id = (byo.clientId ?? "").trim();
  const secret = (byo.clientSecret ?? "").trim();
  if (id && secret) return { clientId: id, clientSecret: secret };
  return { clientId: GEMINI_CLI_CLIENT_ID, clientSecret: GEMINI_CLI_CLIENT_SECRET };
}

export class GeminiByoCredentialsMissingError extends Error {
  constructor() {
    super("Gemini OAuth credentials are missing. Defaults should apply automatically — please report this.");
    this.name = "GeminiByoCredentialsMissingError";
  }
}

const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTH_BASE = "https://claude.ai";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";

// Claude Code (Anthropic Plan) inference requires these exact constants. The
// OAuth Bearer token is only honored by /v1/messages when the request declares
// the matching beta flags + identifies itself as the official CLI.
export const CLAUDE_CODE_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const CLAUDE_CODE_DEFAULT_BETAS = [
  "oauth-2025-04-20",
  "interleaved-thinking-2025-05-14",
  "claude-code-20250219",
];
export const CLAUDE_CODE_SYSTEM_MESSAGE =
  "You are Claude Code, Anthropic's official CLI for Claude.";
export const CLAUDE_CODE_USER_AGENT = "claude-cli/2.1.2 (external, cli)";

interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  email?: string;
}

let activeCallbackServer: import("http").Server | undefined;
let callbackServerClosing = false;

function getNodeRequire(): NodeRequire {
  const candidate = (globalThis as { require?: NodeRequire }).require;
  if (typeof candidate === "function") return candidate;
  return (0, eval)("require") as NodeRequire;
}

function ensureDesktopOAuth(): void {
  if (!Platform.isDesktop) {
    throw new Error("OAuth plan connections are only available on desktop.");
  }
}

function base64UrlEncode(input: ArrayBuffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomVerifier(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomVerifier(43);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64UrlEncode(digest),
  };
}

export function createOAuthState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export function parseOAuthParam(value: string, key: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).searchParams.get(key) ?? "";
  } catch {
    const match = trimmed.match(new RegExp(`[?&]${key}=([^&]+)`));
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  }
}

async function closeCallbackServer(): Promise<void> {
  if (!activeCallbackServer || callbackServerClosing) return;

  callbackServerClosing = true;
  const server = activeCallbackServer;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  activeCallbackServer = undefined;
  callbackServerClosing = false;
}

function parseRedirectUri(redirectUri: string) {
  const url = new URL(redirectUri);
  if (!url.port) {
    throw new Error("OAuth redirect URI must include an explicit port.");
  }

  return {
    hostname: url.hostname,
    port: Number.parseInt(url.port, 10),
    path: url.pathname || "/",
    origin: `${url.protocol}//${url.host}`,
  };
}

export async function waitForOAuthCallback(options: {
  state: string;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<string> {
  ensureDesktopOAuth();

  const { state, redirectUri, timeoutMs = CALLBACK_TIMEOUT_MS } = options;
  const { hostname, port, path, origin } = parseRedirectUri(redirectUri);

  await closeCallbackServer();
  const http = getNodeRequire()("node:http") as typeof import("http");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = async (error?: Error, code?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await closeCallbackServer();
      if (error) {
        reject(error);
        return;
      }
      if (code) {
        resolve(code);
        return;
      }
      reject(new Error("OAuth callback did not return an authorization code."));
    };

    const timeout = setTimeout(() => {
      void settle(new Error("OAuth callback timed out. Try the login flow again."));
    }, timeoutMs);

    const server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", origin);
      if (url.pathname !== path) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const incomingState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (!incomingState) {
        response.statusCode = 400;
        response.end("Missing state parameter");
        void settle(new Error("OAuth callback is missing the state parameter."));
        return;
      }

      if (incomingState !== state) {
        response.statusCode = 400;
        response.end("Invalid state parameter");
        void settle(new Error("OAuth state mismatch. Start the login flow again."));
        return;
      }

      if (error) {
        response.statusCode = 400;
        response.end(`OAuth error: ${errorDescription || error}`);
        void settle(new Error(errorDescription || error));
        return;
      }

      if (!code) {
        response.statusCode = 400;
        response.end("Missing authorization code");
        void settle(new Error("OAuth callback is missing the authorization code."));
        return;
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html");
      response.end(
        "<!doctype html><html><head><title>Authorization Complete</title></head><body><p>You can close this window.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>",
      );

      void settle(undefined, code);
    });

    server.on("error", (error) => {
      void settle(error instanceof Error ? error : new Error("OAuth callback server error."));
    });

    server.listen(port, hostname, () => {
      activeCallbackServer = server;
    });
  });
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

// console.anthropic.com rejects browser-origin requests and also flags Electron's
// requestUrl due to the Origin/User-Agent it injects. Smart Composer works
// because it uses Node's raw https.request, which sends only the headers we
// specify. We mirror that pattern here.
async function postNodeForm(
  endpoint: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  ensureDesktopOAuth();
  const nodeRequire = getNodeRequire();
  const http = nodeRequire("node:http") as typeof import("http");
  const https = nodeRequire("node:https") as typeof import("https");
  const url = new URL(endpoint);
  const client = url.protocol === "https:" ? https : http;
  const payload = new URLSearchParams(body).toString();
  const payloadLength = Buffer.byteLength(payload);

  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": payloadLength.toString(),
        },
      },
      (incoming) => resolve(incoming),
    );
    request.on("error", (error) => reject(error));
    request.write(payload);
    request.end();
  });

  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const status = response.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    throw new Error(`Anthropic OAuth failed: ${status} ${text}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Anthropic OAuth returned non-JSON body: ${text.slice(0, 200)}`);
  }
}

function decodeJwtPayload(token: string): Record<string, any> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function extractOpenAIAccountId(tokenResponse: OAuthTokenResponse): string | undefined {
  const payload = tokenResponse.id_token
    ? decodeJwtPayload(tokenResponse.id_token)
    : tokenResponse.access_token
      ? decodeJwtPayload(tokenResponse.access_token)
      : undefined;

  return (
    payload?.chatgpt_account_id ||
    payload?.["https://api.openai.com/auth"]?.chatgpt_account_id ||
    payload?.organizations?.[0]?.id
  );
}

export function buildOpenAIPlanAuthorizeUrl(options: { pkce: PkcePair; state: string; redirectUri?: string }): string {
  const redirectUri = options.redirectUri ?? OPENAI_REDIRECT_URI;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: OPENAI_SCOPES.join(" "),
    code_challenge: options.pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: options.state,
    originator: "obsidian-notepack-codex",
  });
  return `${OPENAI_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export async function exchangeOpenAIPlanCode(options: {
  code: string;
  pkceVerifier: string;
  redirectUri?: string;
}): Promise<OAuthTokenResponse> {
  return postForm(`${OPENAI_AUTH_BASE}/oauth/token`, {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri ?? OPENAI_REDIRECT_URI,
    client_id: OPENAI_CLIENT_ID,
    code_verifier: options.pkceVerifier,
  });
}

export async function refreshOpenAIPlanToken(options: {
  refreshToken: string;
}): Promise<OAuthTokenResponse> {
  return postForm(`${OPENAI_AUTH_BASE}/oauth/token`, {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: OPENAI_CLIENT_ID,
  });
}

export function buildGeminiPlanAuthorizeUrl(options: {
  pkce: PkcePair;
  state: string;
  clientId: string;
  redirectUri?: string;
}): string {
  const redirectUri = options.redirectUri ?? GEMINI_REDIRECT_URI;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: redirectUri,
    scope: GEMINI_SCOPES.join(" "),
    code_challenge: options.pkce.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state: options.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}#notepack-codex`;
}

export async function exchangeGeminiPlanCode(options: {
  code: string;
  pkceVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}): Promise<OAuthTokenResponse> {
  const tokenResponse = (await postForm("https://oauth2.googleapis.com/token", {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri ?? GEMINI_REDIRECT_URI,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code_verifier: options.pkceVerifier,
  })) as OAuthTokenResponse;

  try {
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: {
        Authorization: `Bearer ${tokenResponse.access_token}`,
      },
    });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      tokenResponse.email = profile.email || undefined;
    }
  } catch {
    // Ignore profile lookup failures; token exchange already succeeded.
  }

  return tokenResponse;
}

function normalizeAnthropicCodeInput(code: string, fallbackState: string): { code: string; state: string } {
  if (code.includes("#")) {
    const [actualCode, maybeState] = code.split("#");
    return {
      code: actualCode,
      state: maybeState || fallbackState,
    };
  }

  return {
    code,
    state: fallbackState,
  };
}

export function buildAnthropicPlanAuthorizeUrl(options: { pkce: PkcePair; state: string; redirectUri?: string }): string {
  const redirectUri = options.redirectUri ?? ANTHROPIC_REDIRECT_URI;
  const params = new URLSearchParams({
    code: "true",
    response_type: "code",
    client_id: ANTHROPIC_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "org:create_api_key user:profile user:inference",
    code_challenge: options.pkce.challenge,
    code_challenge_method: "S256",
    state: options.state,
  });
  return `${ANTHROPIC_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export async function exchangeAnthropicPlanCode(options: {
  code: string;
  state: string;
  pkceVerifier: string;
  redirectUri?: string;
}): Promise<OAuthTokenResponse> {
  const normalized = normalizeAnthropicCodeInput(options.code, options.state);
  // Use raw Node https so Anthropic's OAuth server sees only the headers we
  // declare (no Electron/Origin/User-Agent injection). This mirrors Smart
  // Composer's working transport.
  const json = await postNodeForm(ANTHROPIC_TOKEN_URL, {
    grant_type: "authorization_code",
    client_id: ANTHROPIC_CLIENT_ID,
    redirect_uri: options.redirectUri ?? ANTHROPIC_REDIRECT_URI,
    code: normalized.code,
    state: normalized.state,
    code_verifier: options.pkceVerifier,
  });
  return json as unknown as OAuthTokenResponse;
}

export async function refreshAnthropicPlanToken(options: {
  refreshToken: string;
}): Promise<OAuthTokenResponse> {
  const json = await postNodeForm(ANTHROPIC_TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: ANTHROPIC_CLIENT_ID,
  });
  return json as unknown as OAuthTokenResponse;
}

export const PLAN_REDIRECT_URIS = {
  openai: OPENAI_REDIRECT_URI,
  gemini: GEMINI_REDIRECT_URI,
  anthropic: ANTHROPIC_REDIRECT_URI,
};

// ── Code Assist setup ─────────────────────────────────────────────────────
// The gemini-cli OAuth token authenticates against Google's internal Code
// Assist API (cloudcode-pa.googleapis.com), not the public Gemini API. A
// first-time user needs to be onboarded onto the free tier; subsequent calls
// reuse the managed cloud project ID returned by onboarding.

// Smart Composer's working pattern. Their endpoint is the host only; the
// `/v1internal` path is concatenated at call site. We mirror this exactly.
const CODE_ASSIST_BASE = "https://cloudcode-pa.googleapis.com";
export const CODE_ASSIST_ENDPOINT = `${CODE_ASSIST_BASE}/v1internal`;

// Code Assist routes requests by these client-identification headers — without
// them the backend treats us as an unknown caller and returns 500 INTERNAL.
// Mirrors what the official google-api-nodejs-client sends.
export const CODE_ASSIST_CLIENT_HEADERS: Record<string, string> = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
};

const CODE_ASSIST_METADATA = {
  ideType: "IDE_UNSPECIFIED",
  platform: "PLATFORM_UNSPECIFIED",
  pluginType: "GEMINI",
} as const;

function buildCodeAssistMetadata(projectId?: string): Record<string, string> {
  const metadata: Record<string, string> = {
    ideType: CODE_ASSIST_METADATA.ideType,
    platform: CODE_ASSIST_METADATA.platform,
    pluginType: CODE_ASSIST_METADATA.pluginType,
  };
  if (projectId) metadata.duetProject = projectId;
  return metadata;
}

function isFreeTier(tierId?: string): boolean {
  if (!tierId) return false;
  const normalized = tierId.trim().toUpperCase();
  return normalized === "FREE" || normalized === "FREE-TIER";
}

function pickDefaultTierId(
  allowed?: Array<{ id?: string; isDefault?: boolean }>,
): string | undefined {
  if (!allowed || allowed.length === 0) return undefined;
  const flagged = allowed.find((t) => t?.isDefault);
  return flagged?.id ?? allowed[0]?.id;
}

async function loadCodeAssist(
  accessToken: string,
  projectId?: string,
): Promise<{
  cloudaicompanionProject?: string;
  currentTier?: { id?: string };
  allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
} | null> {
  const body: Record<string, unknown> = { metadata: buildCodeAssistMetadata(projectId) };
  if (projectId) body.cloudaicompanionProject = projectId;
  try {
    const response = await requestUrl({
      url: `${CODE_ASSIST_ENDPOINT}:loadCodeAssist`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...CODE_ASSIST_CLIENT_HEADERS,
      },
      body: JSON.stringify(body),
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) return null;
    return response.json;
  } catch (error) {
    console.error("Failed to load Gemini managed project:", error);
    return null;
  }
}

async function onboardCodeAssistUser(
  accessToken: string,
  tierId: string,
  projectId?: string,
  attempts = 10,
  delayMs = 5000,
): Promise<string | undefined> {
  const body: Record<string, unknown> = {
    tierId,
    metadata: buildCodeAssistMetadata(projectId),
  };
  // For non-free tiers a user-supplied project is required. Free tier omits it
  // and Google issues a managed project.
  if (!isFreeTier(tierId)) {
    if (!projectId) {
      throw new Error(
        "Gemini Plan needs a Google Cloud project. Enable the Gemini for Google Cloud API on a project you control.",
      );
    }
    body.cloudaicompanionProject = projectId;
  }

  // onboardUser is implemented as an idempotent long-running operation. Rather
  // than polling getOperation, gemini-cli's working pattern (and Smart
  // Composer) is to re-call onboardUser repeatedly until it reports done.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await requestUrl({
        url: `${CODE_ASSIST_ENDPOINT}:onboardUser`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...CODE_ASSIST_CLIENT_HEADERS,
        },
        body: JSON.stringify(body),
        throw: false,
      });
      if (response.status < 200 || response.status >= 300) return undefined;
      const payload = response.json as {
        done?: boolean;
        response?: { cloudaicompanionProject?: { id?: string } };
      };
      const managed = payload.response?.cloudaicompanionProject?.id;
      if (payload.done && managed) return managed;
      if (payload.done && projectId) return projectId;
    } catch (error) {
      console.error("Failed to onboard Gemini managed project:", error);
      return undefined;
    }
    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return undefined;
}

/**
 * Resolves the project ID Code Assist needs in the generateContent envelope.
 * Mirrors Smart Composer's ensureProjectContext logic:
 *   1. If the user already has a managed project from loadCodeAssist → use it.
 *   2. If they're on a non-free tier without a project → bail (need user GCP).
 *   3. Otherwise (free tier or never onboarded) → onboard onto FREE tier.
 *
 * Critical fix vs. earlier version: even when `currentTier` is present we must
 * NOT return early with an empty cloudaicompanionProject — instead fall
 * through to onboarding. That was the root cause of the 404 NOT_FOUND.
 */
export async function setupCodeAssistUser(
  accessToken: string,
  existingProjectId?: string,
): Promise<{ projectId?: string }> {
  const trimmed = existingProjectId?.trim();
  const projectIdHint = trimmed && trimmed.length > 0 ? trimmed : undefined;

  const load = await loadCodeAssist(accessToken, projectIdHint);
  if (load?.cloudaicompanionProject) {
    return { projectId: load.cloudaicompanionProject };
  }

  if (!load) {
    throw new Error("Code Assist loadCodeAssist failed — cannot determine Gemini project.");
  }

  const currentTierId = load.currentTier?.id;
  if (currentTierId && !isFreeTier(currentTierId)) {
    // User is on a paid tier but never gave us a project. Smart Composer
    // throws ProjectIdRequiredError here — we surface the same intent.
    throw new Error(
      "Gemini Plan needs a Google Cloud project. Enable the Gemini for Google Cloud API on a project you control.",
    );
  }

  const tierId = pickDefaultTierId(load.allowedTiers) ?? "FREE";
  if (!isFreeTier(tierId)) {
    throw new Error("Gemini Plan onboarding requires a free-tier eligible Google account.");
  }

  const managedProjectId = await onboardCodeAssistUser(accessToken, tierId, projectIdHint);
  if (!managedProjectId) {
    // onboardUser exhausted its 10 retries without returning a project. The
    // call site uses the empty result as the `cloudaicompanionProject` in
    // every subsequent :generateContent envelope, which Google answers with
    // 404 NOT_FOUND on the project (mistaken by users as a model 404).
    // Surface this as an actionable error instead.
    throw new Error(
      "Code Assist onboardUser did not return a managed project. Free-tier signup may be throttled, the Google account may be region-restricted, or the OAuth scope is missing cloud-platform. Try reconnecting in a few minutes, or switch to Gemini API Key mode.",
    );
  }
  return { projectId: managedProjectId };
}
