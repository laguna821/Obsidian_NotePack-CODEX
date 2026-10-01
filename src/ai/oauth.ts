import { Platform } from "obsidian";
import { requireNode } from "./native/process";

// OpenAI Plan (ChatGPT/Codex subscription) is the only plan connection that
// still uses OAuth inside NotePack. Claude Plan and Gemini Plan delegate login
// to their official CLIs and never hand tokens to the plugin.

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_BASE = "https://auth.openai.com";
// Same loopback redirects as the official Codex CLI (0.158+): port 1455, then
// 1457 when 1455 is busy, for example while the Codex CLI itself is signing in.
export const OPENAI_REDIRECT_URIS = [
  "http://127.0.0.1:1455/auth/callback",
  "http://127.0.0.1:1457/auth/callback",
] as const;
const OPENAI_SCOPES = ["openid", "profile", "email", "offline_access"];

interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

// The login flow currently listening for its callback. Starting another flow
// or closing the dialog cancels it, so an old timer never closes a new server.
let activeCallback: { cancel: () => Promise<void> } | undefined;


function ensureDesktopOAuth(): void {
  if (!Platform.isDesktop) {
    throw new Error("OAuth plan connections are only available on desktop.");
  }
}

function base64UrlEncode(input: ArrayBuffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

export async function closeOAuthCallbackServer(): Promise<void> {
  const active = activeCallback;
  activeCallback = undefined;
  await active?.cancel();
}

export function isOAuthLoginCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "OAuthLoginCancelledError";
}

function shutDownServer(server: import("http").Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Browsers keep the callback connection alive; drop it once the response
    // has been sent instead of waiting for the keep-alive timeout.
    server.closeIdleConnections?.();
  });
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

/**
 * Starts the loopback callback server on the first free redirect URI and
 * returns that URI (to build the authorize URL with) plus the pending code.
 */
export async function listenForOAuthCallback(options: {
  state: string;
  redirectUris: readonly string[];
  timeoutMs?: number;
}): Promise<{ redirectUri: string; code: Promise<string> }> {
  ensureDesktopOAuth();
  await closeOAuthCallbackServer();
  const http = requireNode<typeof import("http")>("node:http");

  let lastError: unknown;
  for (const redirectUri of options.redirectUris) {
    const { hostname, port, path, origin } = parseRedirectUri(redirectUri);
    let resolveCode: (code: string) => void = () => undefined;
    let rejectCode: (error: Error) => void = () => undefined;
    const code = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // Never leave an unhandled rejection if the caller stops waiting.
    code.catch(() => undefined);

    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let closed: Promise<void> = Promise.resolve();
    const flow = {
      cancel: () => {
        const error = new Error("The login was cancelled.");
        error.name = "OAuthLoginCancelledError";
        settle(error);
        return closed;
      },
    };
    const settle = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (activeCallback === flow) activeCallback = undefined;
      closed = shutDownServer(server);
      if (error) rejectCode(error);
      else if (value) resolveCode(value);
      else rejectCode(new Error("OAuth callback did not return an authorization code."));
    };

    const server = http.createServer((request, response) => {
      // A kept-alive connection would let the next login's callback reach this
      // flow's closed server instead of the new one.
      response.setHeader("Connection", "close");
      const url = new URL(request.url || "/", origin);
      if (url.pathname !== path) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      const incomingState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      const receivedCode = url.searchParams.get("code");
      if (incomingState !== options.state) {
        response.statusCode = 400;
        response.end("Invalid state parameter");
        settle(new Error("OAuth state mismatch. Start the login flow again."));
        return;
      }
      if (error || !receivedCode) {
        response.statusCode = 400;
        response.end(`OAuth error: ${errorDescription || error || "missing code"}`);
        settle(new Error(errorDescription || error || "OAuth callback is missing the authorization code."));
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html");
      response.end(
        "<!doctype html><html><head><title>Authorization Complete</title></head><body><p>You can close this window.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>",
      );
      settle(undefined, receivedCode);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    activeCallback = flow;
    server.on("error", (error) => settle(error instanceof Error ? error : new Error("OAuth callback server error.")));
    timeout = setTimeout(
      () => settle(new Error("OAuth callback timed out. Try the login flow again.")),
      options.timeoutMs ?? CALLBACK_TIMEOUT_MS,
    );
    return { redirectUri, code };
  }

  throw lastError instanceof Error
    ? new Error(`Could not open a local login callback port: ${lastError.message}`)
    : new Error("Could not open a local login callback port.");
}

async function postForm(url: string, body: Record<string, string>): Promise<OAuthTokenResponse> {
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

  return response.json() as Promise<OAuthTokenResponse>;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
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
  const auth = payload?.["https://api.openai.com/auth"] as { chatgpt_account_id?: unknown } | undefined;
  const organizations = payload?.organizations as Array<{ id?: unknown }> | undefined;

  const candidates = [payload?.chatgpt_account_id, auth?.chatgpt_account_id, organizations?.[0]?.id];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

export function buildOpenAIPlanAuthorizeUrl(options: { pkce: PkcePair; state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: options.redirectUri,
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
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  return postForm(`${OPENAI_AUTH_BASE}/oauth/token`, {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: OPENAI_CLIENT_ID,
    code_verifier: options.pkceVerifier,
  });
}

export async function refreshOpenAIPlanToken(options: { refreshToken: string }): Promise<OAuthTokenResponse> {
  return postForm(`${OPENAI_AUTH_BASE}/oauth/token`, {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: OPENAI_CLIENT_ID,
  });
}
