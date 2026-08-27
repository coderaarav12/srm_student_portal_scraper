import http from "http";
import { DirectSrmScraper, cleanText, errMsg } from "../cloudflare/src/scraper.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
const sessions = new Map<string, any>();
const cache = new Map<string, any>();

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, { ok: true, service: "srm-portal-local-server", version: "2.3.0" });
  }

  if (req.method === "GET" && (url.pathname === "/captcha" || url.pathname === "/api/captcha")) {
    try {
      const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
      const session = await DirectSrmScraper.fetchCaptchaSession();
      sessions.set(sessionId, session);

      return sendJson(res, {
        success: true,
        sessionId,
        captchaImage: session.captchaImageBase64,
        captchaDataUrl: `data:image/png;base64,${session.captchaImageBase64}`,
      });
    } catch (err) {
      return sendJson(res, { success: false, error: errMsg(err) }, 500);
    }
  }

  if (req.method === "POST" && (url.pathname === "/login" || url.pathname === "/api/login")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const netId = cleanText(String(payload.netId || ""));
        const password = String(payload.password || "");
        const captcha = cleanText(String(payload.captcha || ""));
        const sessionId = String(payload.sessionId || "");

        if (!netId || !password) {
          return sendJson(res, { success: false, error: "netId and password required" }, 400);
        }

        let session = sessions.get(sessionId);
        if (!session) {
          session = await DirectSrmScraper.fetchCaptchaSession();
          sessions.set(sessionId, session);
        }

        if (!captcha) {
          return sendJson(res, {
            success: false,
            error: "Captcha required",
            requiresCaptcha: true,
            sessionId,
            captchaImage: session.captchaImageBase64,
            captchaDataUrl: `data:image/png;base64,${session.captchaImageBase64}`,
          }, 400);
        }

        const result = await DirectSrmScraper.submitLoginAndScrape(session, netId, password, captcha);
        sessions.delete(sessionId);
        cache.set(sessionId, result);

        return sendJson(res, {
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
        });
      } catch (err) {
        const fresh = await DirectSrmScraper.fetchCaptchaSession().catch(() => null);
        return sendJson(res, {
          success: false,
          error: errMsg(err),
          requiresCaptcha: true,
          captchaImage: fresh?.captchaImageBase64,
          captchaDataUrl: fresh ? `data:image/png;base64,${fresh.captchaImageBase64}` : undefined,
        }, 400);
      }
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/attendance" || url.pathname === "/api/attendance")) {
    const sessionId = url.searchParams.get("sessionId");
    const data = cache.get(sessionId || "");
    if (data) {
      return sendJson(res, {
        success: true,
        attendance: data.attendance,
        attendanceOutput: data.attendanceOutput,
      });
    }
    return sendJson(res, { success: false, error: "Session expired or not found", sessionExpired: true }, 401);
  }

  if (req.method === "GET" && (url.pathname === "/marks" || url.pathname === "/api/marks")) {
    const sessionId = url.searchParams.get("sessionId");
    const data = cache.get(sessionId || "");
    if (data) {
      return sendJson(res, {
        success: true,
        marks: data.marks,
        marksOutput: data.marksOutput,
      });
    }
    return sendJson(res, { success: false, error: "Session expired or not found", sessionExpired: true }, 401);
  }

  if (req.method === "GET" && (url.pathname === "/internal-marks" || url.pathname === "/api/internal-marks")) {
    const sessionId = url.searchParams.get("sessionId");
    const data = cache.get(sessionId || "");
    if (data) {
      return sendJson(res, {
        success: true,
        internalMarks: data.internalMarks,
        internalMarksOutput: data.internalMarksOutput,
        unifiedSubjects: data.unifiedSubjects,
      });
    }
    return sendJson(res, { success: false, error: "Session expired or not found", sessionExpired: true }, 401);
  }

  sendJson(res, { success: false, error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`[+] SRM Portal Local API running on http://localhost:${PORT}`);
});
