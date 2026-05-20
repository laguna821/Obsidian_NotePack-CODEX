// ── Rate Limiter / Retry / Abort plumbing ─────────────────────────────────
//
// Purpose: throttle outbound AI provider calls so a burst of card additions
// or repeated synthesis triggers can't blow past quota. Also provides
// retry-with-backoff on 429/503/network errors and AbortSignal support so
// the UI can cancel pending requests when a card is deleted or the document
// is closed.

import { Notice } from "obsidian";

export interface ProviderRateLimit {
  concurrency: number;
  minIntervalMs: number;
}

const DEFAULT_LIMIT: ProviderRateLimit = { concurrency: 2, minIntervalMs: 2000 };

const PROVIDER_LIMITS: Record<string, ProviderRateLimit> = {
  "openai-plan": { concurrency: 1, minIntervalMs: 6000 },
  "anthropic-plan": { concurrency: 1, minIntervalMs: 6000 },
  "gemini-plan": { concurrency: 1, minIntervalMs: 6000 },
  anthropic: { concurrency: 2, minIntervalMs: 2000 },
  openai: { concurrency: 2, minIntervalMs: 2000 },
  gemini: { concurrency: 2, minIntervalMs: 2000 },
};

function getLimit(providerType: string): ProviderRateLimit {
  return PROVIDER_LIMITS[providerType] ?? DEFAULT_LIMIT;
}

class Semaphore {
  private pending: Array<() => void> = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.pending.push(() => {
        this.active += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.pending.shift();
    if (next) next();
  }
}

class IntervalGate {
  private lastRun = 0;

  constructor(private readonly minIntervalMs: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const wait = this.lastRun + this.minIntervalMs - now;
    if (wait > 0) await sleep(wait, signal);
    this.lastRun = Date.now();
  }
}

export class ProviderQueue {
  private semaphores = new Map<string, Semaphore>();
  private gates = new Map<string, IntervalGate>();

  async enqueue<T>(providerType: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal);
    const sem = this.getSemaphore(providerType);
    const release = await sem.acquire();
    try {
      throwIfAborted(signal);
      await this.getGate(providerType).wait(signal);
      throwIfAborted(signal);
      return await fn();
    } finally {
      release();
    }
  }

  private getSemaphore(providerType: string): Semaphore {
    let sem = this.semaphores.get(providerType);
    if (!sem) {
      sem = new Semaphore(getLimit(providerType).concurrency);
      this.semaphores.set(providerType, sem);
    }
    return sem;
  }

  private getGate(providerType: string): IntervalGate {
    let gate = this.gates.get(providerType);
    if (!gate) {
      gate = new IntervalGate(getLimit(providerType).minIntervalMs);
      this.gates.set(providerType, gate);
    }
    return gate;
  }
}

export const providerQueue = new ProviderQueue();

// ── Retry ──────────────────────────────────────────────────────────────────

export interface ProviderHttpError {
  status?: number;
  retryAfterMs?: number;
  message: string;
}

export interface RetryOptions {
  retries?: number;
  signal?: AbortSignal;
  retryOn?: number[];
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const retryOn = opts.retryOn ?? Array.from(RETRYABLE_STATUSES);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfAborted(opts.signal);
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      const info = inspectError(error);
      const isRetryable = info.status !== undefined && retryOn.includes(info.status);
      if (!isRetryable || attempt === retries) throw error;

      const backoff =
        info.retryAfterMs ??
        Math.min(15000, 500 * 2 ** attempt + Math.floor(Math.random() * 250));
      if (info.status === 429) notifyRateLimitOnce(info);
      await sleep(backoff, opts.signal);
    }
  }

  throw lastErr;
}

function inspectError(error: unknown): ProviderHttpError {
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown> & { message?: string };
    const message = typeof candidate.message === "string" ? candidate.message : String(error);
    const statusFromField = typeof candidate.status === "number" ? candidate.status : undefined;
    const statusFromMessage = matchStatus(message);
    const retryAfterMs = typeof candidate.retryAfterMs === "number" ? candidate.retryAfterMs : undefined;
    return { status: statusFromField ?? statusFromMessage, message, retryAfterMs };
  }
  const message = typeof error === "string" ? error : String(error);
  return { status: matchStatus(message), message };
}

function matchStatus(message: string): number | undefined {
  // Provider error strings look like "AI error (gemini) 429: ..."
  const match = message.match(/\b(\d{3})\b/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

// ── Abort + sleep helpers ──────────────────────────────────────────────────

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new DOMException("Request aborted", "AbortError");
    throw err;
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    throwIfAborted(signal);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Request aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException("Request aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

// ── Rate-limit Notice (throttled to 1/minute) ──────────────────────────────

let lastNoticeAt = 0;

function notifyRateLimitOnce(info: ProviderHttpError): void {
  const now = Date.now();
  if (now - lastNoticeAt < 60000) return;
  lastNoticeAt = now;
  const detail = info.retryAfterMs
    ? ` Retrying in ${Math.round(info.retryAfterMs / 1000)}s.`
    : "";
  new Notice(`AI 제공자 요청 제한(429).${detail}`, 6000);
}

// ── Combined helper for provider call sites ────────────────────────────────

export async function executeProviderRequest<T>(
  providerType: string,
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return providerQueue.enqueue(
    providerType,
    () => withRetry(fn, { signal, retries: 3 }),
    signal,
  );
}
