/**
 * Host half of the OpenCode quota bundle.
 *
 * Reads the allowance windows OpenCode publishes for a paid OpenCode API key
 * (`GET https://opencode.ai/zen/go/v1/usage`) for every OpenCode provider this
 * DSH profile has configured, resolving each provider's API key through the
 * Host credential store. The Client half renders the result beside the
 * composer; nothing here talks to the model registry itself.
 *
 * @module dsh-plugin-opencode-quota
 */

const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Allowance windows OpenCode returns, in the order the Client shows them. */
const WINDOW_KEYS = ['rolling', 'weekly', 'monthly']

/**
 * Usage endpoint per provider route. `opencode-go` is the paid OpenCode plan
 * whose allowance is readable with an API key; OpenCode Zen's pay-as-you-go
 * credits are not exposed to API keys at all.
 */
const USAGE_ENDPOINTS = new Map([
  ['opencode-go', 'https://opencode.ai/zen/go/v1/usage'],
])

/** Providers whose allowance exists only in the OpenCode web console. */
const CONSOLE_ONLY_PROVIDERS = new Set(['opencode'])

/** How long one successful reading is reused, in milliseconds. */
const CACHE_MS = 45_000

/** How long one failure is remembered, in milliseconds. */
const FAILURE_CACHE_MS = 10_000

/** Request timeout for one usage call, in milliseconds. */
const REQUEST_TIMEOUT_MS = 8_000

/**
 * The credential reference a provider route resolves its API key through.
 *
 * DSH's provider directory maps `opencode` to `OPENCODE_API_KEY` and
 * `opencode-go` to `OPENCODE_GO_API_KEY`, which is the same derivation for
 * every route whose id has no digits or double dashes.
 * @param {string} provider - Provider route id.
 * @returns {string} Environment-variable-style credential reference name.
 */
function keyRefFor(provider) {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * Normalize one OpenCode window into the Client's shape.
 * @param {string} key - Window key (`rolling`, `weekly`, `monthly`).
 * @param {unknown} raw - One entry of the endpoint's `usage` object.
 * @returns {{ key: string, status: string, usedPercent: number, remainingPercent: number, resetsAt: string | null } | null} Window, or null when absent.
 */
function normalizeWindow(key, raw) {
  if (raw === null || typeof raw !== 'object') return null
  const percent = Number(raw.percent)
  const usedPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0
  return {
    key,
    status: typeof raw.status === 'string' ? raw.status : 'ok',
    usedPercent: Math.round(usedPercent * 10) / 10,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
    resetsAt: typeof raw.resetsAt === 'string' ? raw.resetsAt : null,
  }
}

/** @param {unknown} error @returns {string} */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Host Remote service owning OpenCode allowance readings.
 *
 * Registered through `ctx.provide` and marked on its prototype: this authored
 * JavaScript bundle has no decorator transform, so the Typert Gateway's source
 * fallback reads the same marker shape the decorator writes.
 */
export class OpenCodeQuotaService {
  /** @param {import('@deepseek-ai/cordis').Context} ctx - Host context. */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {Map<string, { at: number, value: Record<string, unknown> }>} */
    this.cache = new Map()
  }

  /**
   * Provider routes this profile has configured whose allowance is readable.
   *
   * Configured routes are the primary source. A profile can hold the API key
   * before (or without) the adapter registering that route, so a known route
   * whose credential reference resolves is included as a fallback: that is the
   * state where the chip must still explain itself instead of disappearing.
   * @returns {Promise<string[]>} Sorted provider route ids.
   */
  async configuredProviders() {
    const llm = this.ctx.get('llm')
    const routes = []
    if (typeof llm?.listProviders === 'function') {
      for (const info of llm.listProviders() ?? []) {
        const id = typeof info?.id === 'string' ? info.id : ''
        if (id.length > 0 && (USAGE_ENDPOINTS.has(id) || CONSOLE_ONLY_PROVIDERS.has(id))) routes.push(id)
      }
    }
    if (routes.length > 0) return [...new Set(routes)]

    const fallback = []
    for (const provider of [...USAGE_ENDPOINTS.keys(), ...CONSOLE_ONLY_PROVIDERS]) {
      if (await this.resolveKey(keyRefFor(provider)) !== undefined) fallback.push(provider)
    }
    return fallback
  }

  /**
   * Human-readable provider name from the live registry.
   * @param {string} provider - Provider route id.
   * @returns {string} Display name, or the id when the route is not registered.
   */
  displayNameOf(provider) {
    const llm = this.ctx.get('llm')
    if (typeof llm?.listProviders === 'function') {
      for (const info of llm.listProviders() ?? []) {
        if (info?.id === provider && typeof info.name === 'string' && info.name.length > 0) return info.name
      }
    }
    return provider
  }

  /**
   * Resolve one credential reference without exposing it.
   * @param {string} ref - Credential reference name.
   * @returns {Promise<string | undefined>} Secret value when configured.
   */
  async resolveKey(ref) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined || typeof credentials.resolve !== 'function') return undefined
    try {
      const resolved = await credentials.resolve(ref)
      const value = typeof resolved?.value === 'string' ? resolved.value.trim() : ''
      return value.length > 0 ? value : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Read one provider's allowance windows, reusing a recent reading.
   * @param {string} provider - Provider route id.
   * @returns {Promise<Record<string, unknown>>} One account reading.
   */
  async readAccount(provider) {
    const keyRef = keyRefFor(provider)
    const base = {
      provider,
      name: this.displayNameOf(provider),
      keyRef,
      endpoint: USAGE_ENDPOINTS.get(provider) ?? null,
    }
    if (CONSOLE_ONLY_PROVIDERS.has(provider)) {
      return { ...base, status: 'console-only', windows: [] }
    }

    const cached = this.cache.get(provider)
    const now = Date.now()
    if (cached !== undefined && now - cached.at < (cached.value.status === 'ok' ? CACHE_MS : FAILURE_CACHE_MS)) {
      return cached.value
    }

    const apiKey = await this.resolveKey(keyRef)
    if (apiKey === undefined) {
      const value = { ...base, status: 'unconfigured', windows: [] }
      this.cache.set(provider, { at: now, value })
      return value
    }

    let value
    try {
      const response = await fetch(base.endpoint, {
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 401 || response.status === 403) {
        value = { ...base, status: 'unauthorized', windows: [] }
      } else if (!response.ok) {
        value = { ...base, status: 'error', message: `HTTP ${response.status}`, windows: [] }
      } else {
        const body = await response.json()
        const usage = body?.usage ?? {}
        const windows = WINDOW_KEYS
          .map(key => normalizeWindow(key, usage[key]))
          .filter(window => window !== null)
        value = { ...base, status: 'ok', windows }
      }
    } catch (error) {
      const message = messageOf(error)
      value = {
        ...base,
        status: /timeout|abort/i.test(message) ? 'timeout' : 'error',
        message,
        windows: [],
      }
    }

    this.cache.set(provider, { at: now, value })
    return value
  }

  /**
   * Read every configured OpenCode account.
   * @returns {Promise<{ ok: true, value: { accounts: Array<Record<string, unknown>>, readAt: string } }>} Reading.
   */
  async read() {
    const providers = await this.configuredProviders()
    const accounts = []
    for (const provider of providers) accounts.push(await this.readAccount(provider))
    return {
      ok: true,
      value: {
        accounts,
        readAt: new Date().toISOString(),
      },
    }
  }
}

Object.defineProperty(OpenCodeQuotaService.prototype, REMOTE_METHODS, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'read', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
})

/**
 * Mount the OpenCode quota Remote on this Host composition.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 */
export function apply(ctx) {
  const service = new OpenCodeQuotaService(ctx)
  service.typertRemote = Object.freeze({
    service,
    serviceKey: 'opencodeQuota',
    namespace: 'opencodeQuota',
  })
  ctx.provide('opencodeQuota', service)
}