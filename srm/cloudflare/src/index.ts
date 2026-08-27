import { acquire, connect } from "@cloudflare/playwright";
import { DurableObject } from "cloudflare:workers";
import {
  DirectSrmScraper,
  StoredPortalSession,
  AttendanceRow,
  MarksReport,
  InternalMarkRow,
  UnifiedSubjectRecord,
  USER_AGENT,
  cleanText,
  errMsg,
} from "./scraper.js";

const ALARM_STEP_MS = 30_000;
const SESSION_POOL_SIZE = 2;
const CACHE_TTL_SECONDS = 300;

export interface Env {
  BROWSER: Fetcher;
  SRM_SESSION: DurableObjectNamespace;
  CACHE?: KVNamespace;
}

export interface CacheEntry {
  attendance: AttendanceRow[];
  marks?: MarksReport;
  internalMarks?: InternalMarkRow[];
  unifiedSubjects?: UnifiedSubjectRecord[];
  timestamp: number;
  attendanceOutput: string;
  marksOutput?: string;
  internalMarksOutput?: string;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-session-id",
    "access-control-max-age": "86400",
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

class BrowserSessionPool {
  private browsers: Map<string, any> = new Map();
  private contexts: Map<string, any> = new Map();
  private pages: Map<string, any> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private env: Env;
  private storage: DurableObjectStorage;

  constructor(env: Env, storage: DurableObjectStorage) {
    this.env = env;
    this.storage = storage;
  }

  async getSession(sessionId: string): Promise<any> {
    const cachedPage = this.pages.get(sessionId);
    if (cachedPage) {
      this.lastUsed.set(sessionId, Date.now());
      return cachedPage;
    }

    if (this.browsers.size >= SESSION_POOL_SIZE) {
      await this.evictOldest();
    }

    try {
      const savedBrowserSessionId = await this.storage.get<string>(`browsersession:${sessionId}`);
      if (savedBrowserSessionId) {
        const reconnected = await connect(this.env.BROWSER, { sessionId: savedBrowserSessionId });
        const contexts = reconnected.contexts?.() || [];
        const pages = contexts[0]?.pages?.() || [];
        const page = pages.length ? pages[pages.length - 1] : await contexts[0]?.newPage?.();
        if (page) {
          this.browsers.set(sessionId, reconnected);
          this.contexts.set(sessionId, contexts[0]);
          this.pages.set(sessionId, page);
          this.lastUsed.set(sessionId, Date.now());
          return page;
        }
        try { await reconnected.close(); } catch {}
      }
    } catch {}

    const browserObj = await acquire(this.env.BROWSER);
    const browser = (browserObj as any).browser ?? browserObj;

    let actualBrowser = browser;
    let acquiredBrowserSessionId: string | null = null;
    if (browser && typeof browser === "object" && "sessionId" in browser) {
      acquiredBrowserSessionId = (browser as any).sessionId;
      actualBrowser = await connect(this.env.BROWSER, { sessionId: acquiredBrowserSessionId as string });
    }

    const context = await actualBrowser.newContext({
      userAgent: USER_AGENT,
      bypassCSP: true,
    });
    const page = await context.newPage();

    this.browsers.set(sessionId, actualBrowser);
    this.contexts.set(sessionId, context);
    this.pages.set(sessionId, page);
    this.lastUsed.set(sessionId, Date.now());

    if (acquiredBrowserSessionId) {
      await this.storage.put(`browsersession:${sessionId}`, acquiredBrowserSessionId).catch(() => {});
    }

    return page;
  }

  async closeSession(sessionId: string): Promise<void> {
    const page = this.pages.get(sessionId);
    if (page) { try { await page.close(); } catch {} this.pages.delete(sessionId); }
    const context = this.contexts.get(sessionId);
    if (context) { try { await context.close(); } catch {} this.contexts.delete(sessionId); }
    const browser = this.browsers.get(sessionId);
    if (browser) { try { await browser.close(); } catch {} this.browsers.delete(sessionId); }
    await this.storage.delete(`browsersession:${sessionId}`).catch(() => {});
    this.lastUsed.delete(sessionId);
  }

  private async evictOldest(): Promise<void> {
    let oldestId = "";
    let oldestTime = Infinity;
    for (const [id, time] of this.lastUsed) {
      if (time < oldestTime) { oldestTime = time; oldestId = id; }
    }
    if (oldestId) await this.closeSession(oldestId);
  }
}

export class SrmSession extends DurableObject<Env> {
  private pool: BrowserSessionPool;
  private cache: KVNamespace | Map<string, string>;
  private alarmSet = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cache = env.CACHE || new Map();
    this.pool = new BrowserSessionPool(env, ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request.headers.get("origin"));

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true, version: "2.3.0" }, 200, headers);
      }

      if (request.method === "GET" && (url.pathname === "/captcha" || url.pathname === "/api/captcha")) {
        return this.handleCaptcha(request);
      }

      if (request.method === "POST" && (url.pathname === "/login" || url.pathname === "/api/login")) {
        return this.handleLogin(request);
      }

      if (request.method === "GET" && (url.pathname === "/attendance" || url.pathname === "/api/attendance")) {
        return this.handleAttendance(request);
      }

      if (request.method === "GET" && (url.pathname === "/marks" || url.pathname === "/api/marks")) {
        return this.handleMarks(request);
      }

      if (request.method === "GET" && (url.pathname === "/internal-marks" || url.pathname === "/api/internal-marks")) {
        return this.handleInternalMarks(request);
      }

      if (request.method === "POST" && (url.pathname === "/logout" || url.pathname === "/api/logout")) {
        return this.handleLogout(request);
      }

      return jsonResponse({ success: false, error: "Not found" }, 404, headers);
    } catch (error) {
      return jsonResponse({ success: false, error: errMsg(error) }, 500, headers);
    }
  }

  private async handleCaptcha(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let sessionId = url.searchParams.get("sessionId");
    const headers = corsHeaders(request.headers.get("origin"));

    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    try {
      const portalSession = await DirectSrmScraper.fetchCaptchaSession();
      await this.ctx.storage.put(`portalsession:${sessionId}`, JSON.stringify(portalSession));
      await this.setAlarm();

      return jsonResponse({
        success: true,
        sessionId,
        captchaImage: portalSession.captchaImageBase64,
        captchaDataUrl: `data:image/png;base64,${portalSession.captchaImageBase64}`,
      }, 200, headers);
    } catch (err) {
      return jsonResponse({ success: false, error: `Failed to fetch captcha: ${errMsg(err)}` }, 500, headers);
    }
  }

  private async handleLogin(request: Request): Promise<Response> {
    const headers = corsHeaders(request.headers.get("origin"));
    const rawBody = await request.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400, headers);
    }

    const netId = cleanText(String(body.netId || ""));
    const password = String(body.password || "");
    const manualCaptcha = cleanText(String(body.captcha || ""));
    const sessionId = body.sessionId ? String(body.sessionId) : crypto.randomUUID();

    if (!netId || !password) {
      return jsonResponse({ success: false, error: "netId and password are required" }, 400, headers);
    }

    const savedSessionRaw = await this.ctx.storage.get<string>(`portalsession:${sessionId}`);
    let portalSession: StoredPortalSession | null = null;
    if (savedSessionRaw) {
      try {
        portalSession = JSON.parse(savedSessionRaw);
      } catch {}
    }

    if (!portalSession) {
      portalSession = await DirectSrmScraper.fetchCaptchaSession();
      await this.ctx.storage.put(`portalsession:${sessionId}`, JSON.stringify(portalSession));
    }

    if (!manualCaptcha) {
      return jsonResponse({
        success: false,
        error: "Captcha required",
        requiresCaptcha: true,
        sessionId,
        captchaImage: portalSession.captchaImageBase64,
        captchaDataUrl: `data:image/png;base64,${portalSession.captchaImageBase64}`,
      }, 400, headers);
    }

    try {
      const result = await DirectSrmScraper.submitLoginAndScrape(
        portalSession,
        netId,
        password,
        manualCaptcha
      );

      const cacheEntry: CacheEntry = {
        attendance: result.attendance,
        marks: result.marks,
        internalMarks: result.internalMarks,
        unifiedSubjects: result.unifiedSubjects,
        timestamp: Date.now(),
        attendanceOutput: result.attendanceOutput,
        marksOutput: result.marksOutput,
        internalMarksOutput: result.internalMarksOutput,
      };

      await this.ctx.storage.put(`portaldata:${sessionId}`, JSON.stringify(cacheEntry));
      await this.ctx.storage.delete(`portalsession:${sessionId}`);
      await this.setAlarm();

      return jsonResponse({
        success: true,
        message: "Login successful",
        sessionId,
        attendance: result.attendance,
        attendanceOutput: result.attendanceOutput,
        marks: result.marks,
        marksOutput: result.marksOutput,
        internalMarks: result.internalMarks,
        internalMarksOutput: result.internalMarksOutput,
        unifiedSubjects: result.unifiedSubjects,
      }, 200, headers);
    } catch (loginErr) {
      const freshSession = await DirectSrmScraper.fetchCaptchaSession().catch(() => null);
      if (freshSession) {
        await this.ctx.storage.put(`portalsession:${sessionId}`, JSON.stringify(freshSession));
      }

      return jsonResponse({
        success: false,
        error: errMsg(loginErr),
        requiresCaptcha: true,
        sessionId,
        captchaImage: freshSession?.captchaImageBase64,
        captchaDataUrl: freshSession ? `data:image/png;base64,${freshSession.captchaImageBase64}` : undefined,
      }, 400, headers);
    }
  }

  private async handleAttendance(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const headers = corsHeaders(request.headers.get("origin"));

    if (!sessionId) {
      return jsonResponse({ success: false, error: "sessionId parameter is required" }, 400, headers);
    }

    const cached = await this.ctx.storage.get<string>(`portaldata:${sessionId}`);

    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      return jsonResponse({
        success: true,
        attendance: entry.attendance,
        attendanceOutput: entry.attendanceOutput,
        cached: true,
      }, 200, headers);
    }

    return jsonResponse({ success: false, error: "No active or cached session found", sessionExpired: true }, 401, headers);
  }

  private async handleMarks(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const headers = corsHeaders(request.headers.get("origin"));

    if (!sessionId) {
      return jsonResponse({ success: false, error: "sessionId parameter is required" }, 400, headers);
    }

    const cached = await this.ctx.storage.get<string>(`portaldata:${sessionId}`);

    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      return jsonResponse({
        success: true,
        marks: entry.marks,
        marksOutput: entry.marksOutput,
        cached: true,
      }, 200, headers);
    }

    return jsonResponse({ success: false, error: "No active or cached session found", sessionExpired: true }, 401, headers);
  }

  private async handleInternalMarks(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const headers = corsHeaders(request.headers.get("origin"));

    if (!sessionId) {
      return jsonResponse({ success: false, error: "sessionId parameter is required" }, 400, headers);
    }

    const cached = await this.ctx.storage.get<string>(`portaldata:${sessionId}`);

    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      return jsonResponse({
        success: true,
        internalMarks: entry.internalMarks,
        internalMarksOutput: entry.internalMarksOutput,
        unifiedSubjects: entry.unifiedSubjects,
        cached: true,
      }, 200, headers);
    }

    return jsonResponse({ success: false, error: "No active or cached session found", sessionExpired: true }, 401, headers);
  }

  private async handleLogout(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = cleanText(String(body.sessionId || ""));
    const headers = corsHeaders(request.headers.get("origin"));

    if (sessionId) {
      await this.pool.closeSession(sessionId);
      await this.ctx.storage.delete(`portalsession:${sessionId}`);
      if (this.cache instanceof Map) {
        this.cache.delete(`portaldata:${sessionId}`);
      } else {
        await this.cache.delete(`portaldata:${sessionId}`);
      }
    }
    return jsonResponse({ success: true, message: "Logged out successfully" }, 200, headers);
  }

  private async setAlarm(): Promise<void> {
    if (!this.alarmSet) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_STEP_MS);
      this.alarmSet = true;
    }
  }

  async alarm(): Promise<void> {
    this.alarmSet = false;
  }
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const headers = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, service: "srm-attendance-scraper", version: "2.3.0" }, 200, headers);
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const rawBody = await request.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      body = {};
    }
    const sessionId = String(body.sessionId || "") || crypto.randomUUID();
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
  }

  if (request.method === "GET" && url.pathname === "/api/captcha") {
    const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
    const targetUrl = new URL(request.url);
    targetUrl.searchParams.set("sessionId", sessionId);
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(new Request(targetUrl.toString(), { method: "GET", headers: request.headers }));
  }

  if (request.method === "GET" && url.pathname === "/api/attendance") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return jsonResponse({ success: false, error: "sessionId required" }, 400, headers);
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(request);
  }

  if (request.method === "GET" && url.pathname === "/api/marks") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return jsonResponse({ success: false, error: "sessionId required" }, 400, headers);
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(request);
  }

  if (request.method === "GET" && url.pathname === "/api/internal-marks") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return jsonResponse({ success: false, error: "sessionId required" }, 400, headers);
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(request);
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = cleanText(String(body.sessionId || ""));
    if (!sessionId) return jsonResponse({ success: false, error: "sessionId required" }, 400, headers);
    const stub = env.SRM_SESSION.get(env.SRM_SESSION.idFromName(sessionId));
    return stub.fetch(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
  }

  return jsonResponse({ success: false, error: "Endpoint not found" }, 404, headers);
}

export default { fetch: handleRequest } satisfies ExportedHandler<Env>;