import { load as loadHtml } from "cheerio";

export const PORTAL_ORIGIN = "https://sp.srmist.edu.in";
export const LOGIN_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/loginManager/youLogin.jsp`;
export const LOGIN_SERVLET_URL = `${PORTAL_ORIGIN}/srmiststudentportal/LoginServlet`;
export const HOME_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/loginManager/UserHomePage.jsp`;
export const HRD_SYSTEM_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/template/HRDSystem.jsp`;
export const ATTENDANCE_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/report/studentAttendanceDetails.jsp`;
export const MARKS_CREDITS_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/report/studentMarksCredits.jsp`;
export const INTERNAL_MARKS_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/report/studentInternalMarkDetails.jsp`;
export const INTERNAL_MARKS_INNER_URL = `${PORTAL_ORIGIN}/srmiststudentportal/students/report/studentInternalMarkDetailsInner.jsp`;

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type AttendanceRow = {
  code: string;
  name: string;
  attended: number;
  total: number;
  percentage: number;
  category?: string;
  slot?: string;
};

export type GradeCourse = {
  semester: number;
  monthYear: string;
  code: string;
  name: string;
  credit: number;
  grade: string;
};

export type SemesterGradeSummary = {
  semester: number;
  sgpa: number;
  courses: GradeCourse[];
};

export type InternalMarkComponent = {
  title: string;
  markObtained: number;
  maxMark: number;
};

export type InternalMarkRow = {
  code: string;
  name: string;
  markObtained: number | null;
  maxMark: number | null;
  rawMarkText: string;
  subjectId?: string;
  components?: InternalMarkComponent[];
};

export type MarksReport = {
  cgpa: number;
  creditsEarned: number;
  creditsRegistered: number;
  creditsRequired: number;
  semesters: SemesterGradeSummary[];
};

export type UnifiedSubjectRecord = {
  code: string;
  name: string;
  attendance?: {
    attended: number;
    total: number;
    percentage: number;
  };
  internalMarks?: {
    markObtained: number | null;
    maxMark: number | null;
    rawText: string;
  };
  completedGrade?: {
    semester: number;
    grade: string;
    credit: number;
  };
};

export type StudentPortalData = {
  attendance: AttendanceRow[];
  attendanceOutput: string;
  marks: MarksReport;
  marksOutput: string;
  internalMarks: InternalMarkRow[];
  internalMarksOutput: string;
  unifiedSubjects: UnifiedSubjectRecord[];
  sessionEntries: [string, string][];
};

export interface StoredPortalSession {
  cookies: [string, string][];
  nonce: string;
  domainFieldName: string;
  captchaFieldName: string;
  randomDelimiter: string;
  challengeId: string;
  fpNonce: string;
  dname: string;
  dataSrc: string;
  loadTime: number;
  captchaImageBase64?: string;
}

export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseNum(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bytesToBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export class CookieJar {
  private cookies = new Map<string, string>();

  constructor(entries?: [string, string][]) {
    if (entries) {
      for (const [k, v] of entries) this.cookies.set(k, v);
    }
  }

  setFromHeader(headerValue: string | null | string[]): void {
    if (!headerValue) return;
    const parts = Array.isArray(headerValue) ? headerValue : [headerValue];
    for (const part of parts) {
      const singleCookies = part.split(/,(?=\s*[A-Za-z0-9_$-]+=)/);
      for (const c of singleCookies) {
        const [cookiePair] = c.split(";");
        const eqIdx = cookiePair.indexOf("=");
        if (eqIdx !== -1) {
          const name = cookiePair.slice(0, eqIdx).trim();
          const value = cookiePair.slice(eqIdx + 1).trim();
          if (name) this.cookies.set(name, value);
        }
      }
    }
  }

  getHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  getEntries(): [string, string][] {
    return Array.from(this.cookies.entries());
  }
}

export function parseAttendanceTable(html: string): AttendanceRow[] {
  const $ = loadHtml(html);
  const rows: AttendanceRow[] = [];

  const tables = $("table");
  for (const table of tables) {
    const $table = $(table);
    const headers = $table
      .find("tr th, tr:first-child td")
      .map((_, el) => cleanText($(el).text()))
      .get();
    if (headers.length < 4) continue;

    const codeIdx = headers.findIndex((h) => /code/i.test(h));
    const nameIdx = headers.findIndex((h) => /desc|subject|name/i.test(h));
    const attIdx = headers.findIndex((h) => /att\.?\s*hours|attended|present/i.test(h));
    const totIdx = headers.findIndex((h) => /max\.?\s*hours|total|conduct/i.test(h));
    const pctIdx = headers.findIndex((h) => /%|percent/i.test(h));

    if (codeIdx === -1 || nameIdx === -1) continue;

    $table.find("tr").each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((_, el) => cleanText($(el).text()))
        .get();
      if (cells.length < Math.max(codeIdx, nameIdx, attIdx, totIdx) + 1) return;

      const code = cells[codeIdx] || "";
      const name = cells[nameIdx] || "";
      if (!code || !name || code.toLowerCase() === "code" || /subject\s*code/i.test(code)) return;

      const attended = Math.round(parseNum(cells[attIdx] || "0"));
      const total = Math.round(parseNum(cells[totIdx] || "0"));
      const rawPct = parseNum(cells[pctIdx] || "0");
      const percentage = Number.isFinite(rawPct) && rawPct > 0 ? Math.round(rawPct * 100) / 100 : (total > 0 ? Math.round((attended / total) * 10000) / 100 : 0);

      if (!isNaN(attended) && !isNaN(total)) {
        rows.push({ code, name, attended, total, percentage });
      }
    });

    if (rows.length > 0) break;
  }
  return rows;
}

export function parseMarksTable(html: string): MarksReport {
  const $ = loadHtml(html);
  const semestersMap = new Map<number, SemesterGradeSummary>();
  let cgpa = 0;
  let creditsEarned = 0;
  let creditsRegistered = 0;
  let creditsRequired = 0;

  const tables = $("table");
  for (const table of tables) {
    const $table = $(table);
    const rows = $table.find("tr");

    rows.each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((_, el) => cleanText($(el).text()))
        .get();
      if (cells.length < 2) return;

      if (cells[0].toUpperCase() === "SGPA" || cells[0].toUpperCase().includes("SGPA")) {
        const val = parseNum(cells[1]);
        if (!isNaN(val)) {
          const lastSem = Array.from(semestersMap.keys()).pop();
          if (lastSem !== undefined) {
            const semData = semestersMap.get(lastSem)!;
            semData.sgpa = val;
          }
        }
        return;
      }

      if (cells[0].toUpperCase() === "CGPA" || cells[0].toUpperCase().includes("CGPA")) {
        const val = parseNum(cells[1]);
        if (!isNaN(val)) cgpa = val;
        return;
      }

      if (cells[0].includes("Credits Earned")) {
        creditsEarned = parseNum(cells[1]) || 0;
        return;
      }
      if (cells[0].includes("Credits Registered")) {
        creditsRegistered = parseNum(cells[1]) || 0;
        return;
      }
      if (cells[0].includes("Credits Required")) {
        creditsRequired = parseNum(cells[1]) || 0;
        return;
      }

      if (cells.length >= 6) {
        const sem = parseInt(cells[0], 10);
        if (!isNaN(sem) && sem > 0) {
          const monthYear = cells[1];
          const code = cells[2];
          const name = cells[3];
          const credit = parseNum(cells[4]) || 0;
          const grade = cells[5];

          if (code && name && code.toUpperCase() !== "CODE") {
            if (!semestersMap.has(sem)) {
              semestersMap.set(sem, { semester: sem, sgpa: 0, courses: [] });
            }
            semestersMap.get(sem)!.courses.push({
              semester: sem,
              monthYear,
              code,
              name,
              credit,
              grade,
            });
          }
        }
      }
    });
  }

  // Sort semesters in chronological ascending order (Semester 1, 2, 3...)
  const sortedSemesters = Array.from(semestersMap.values()).sort((a, b) => a.semester - b.semester);

  return {
    cgpa,
    creditsEarned,
    creditsRegistered,
    creditsRequired,
    semesters: sortedSemesters,
  };
}

export function parseInternalMarksTable(html: string): InternalMarkRow[] {
  const $ = loadHtml(html);
  const rows: InternalMarkRow[] = [];

  const tables = $("table");
  for (const table of tables) {
    const $table = $(table);
    $table.find("tbody tr").each((_, tr) => {
      const text = cleanText($(tr).text());
      if (!text || text.includes("No Record found") || text.toLowerCase().includes("no record")) return;

      const cells = $(tr)
        .find("td")
        .map((_, el) => cleanText($(el).text()))
        .get();
      if (cells.length < 3) return;

      const code = cells[0];
      const name = cells[1];
      const rawMarkText = cells[2];

      if (!code || !name || code.toLowerCase() === "code") return;

      let markObtained: number | null = null;
      let maxMark: number | null = null;

      if (rawMarkText.includes("/")) {
        const parts = rawMarkText.split("/");
        markObtained = parseNum(parts[0]);
        maxMark = parseNum(parts[1]);
      } else {
        markObtained = parseNum(rawMarkText);
      }

      // Check for component click handler
      const onclick = $(tr).find("[onclick*='funViewComponentWiseMarks']").attr("onclick") || "";
      const subjectIdMatch = onclick.match(/funViewComponentWiseMarks\(['"]?([^'",]+)['"]?/);
      const subjectId = subjectIdMatch ? subjectIdMatch[1] : undefined;

      rows.push({
        code,
        name,
        markObtained: Number.isFinite(markObtained) ? markObtained : null,
        maxMark: Number.isFinite(maxMark) ? maxMark : null,
        rawMarkText,
        subjectId,
      });
    });

    if (rows.length > 0) break;
  }

  return rows;
}

export function normalizeAttendanceOutput(attendance: AttendanceRow[], sourceUrl: string): string {
  const lines = attendance.map(
    (r) => `${r.code.padEnd(12)} | ${r.name.padEnd(45)} | ${String(r.attended).padStart(2)}/${String(r.total).padStart(2)} hrs (${r.percentage.toFixed(2)}%)`
  );
  return `=== CURRENT ATTENDANCE ===\nSource: ${sourceUrl}\n${lines.join("\n")}\nTotal Subjects: ${attendance.length}`;
}

export function normalizeMarksOutput(marks: MarksReport): string {
  const sections: string[] = ["=== COMPLETED SEMESTERS GRADE & CGPA REPORT ==="];
  sections.push(`Cumulative CGPA: ${marks.cgpa > 0 ? marks.cgpa.toFixed(2) : "N/A"} | Credits Earned: ${marks.creditsEarned}/${marks.creditsRequired}\n`);

  for (const sem of marks.semesters) {
    sections.push(`--- Semester ${sem.semester} (SGPA: ${sem.sgpa > 0 ? sem.sgpa.toFixed(3) : "N/A"}) ---`);
    for (const c of sem.courses) {
      sections.push(`${c.code.padEnd(12)} | ${c.name.padEnd(50)} | ${c.credit} Credits | Grade: ${c.grade}`);
    }
    sections.push("");
  }

  return sections.join("\n").trim();
}

export function normalizeInternalMarksOutput(internalMarks: InternalMarkRow[]): string {
  if (internalMarks.length === 0) {
    return `=== INTERNAL MARK DETAILS ===\nStatus: No internal marks published yet for current semester.`;
  }

  const lines = internalMarks.map(
    (r) => `${r.code.padEnd(12)} | ${r.name.padEnd(45)} | Mark: ${r.rawMarkText}`
  );
  return `=== INTERNAL MARK DETAILS ===\n${lines.join("\n")}\nTotal Subjects: ${internalMarks.length}`;
}

export class DirectSrmScraper {
  static async fetchCaptchaSession(): Promise<StoredPortalSession> {
    const jar = new CookieJar();
    const loadTime = Date.now();

    const loginRes = await fetch(LOGIN_URL, {
      headers: { "User-Agent": USER_AGENT },
    });

    jar.setFromHeader(loginRes.headers.get("set-cookie"));
    const html = await loginRes.text();

    const nonce = html.match(/nonce:\s*'([^']+)'/)?.[1] || "";
    const domainFieldName = html.match(/domainFieldName\s*=\s*'([^']+)'/)?.[1] || "";
    const captchaFieldName = html.match(/captchaFieldName\s*=\s*'([^']+)'/)?.[1] || "";
    const randomDelimiter = html.match(/randomDelimiter\s*=\s*'([^']+)'/)?.[1] || "";

    const challengeId = html.match(/id="challengeId"\s+value="([^"]+)"/)?.[1] || "";
    const fpNonce = html.match(/id="fpNonce"\s+value="([^"]+)"/)?.[1] || "";
    const dname = html.match(/id="?dname"?\s+value="([^"]+)"/)?.[1] || "";
    const dataSrc = html.match(/data-src="([^"]+)"/)?.[1] || "";

    if (!dataSrc) {
      throw new Error("Captcha data-src not found on login page");
    }

    const domainProof = btoa(`${nonce}:sp.srmist.edu.in`);
    const captchaUrl = `${PORTAL_ORIGIN}${dataSrc}`;

    const captchaRes = await fetch(captchaUrl, {
      headers: {
        Cookie: jar.getHeader(),
        "X-Domain-Proof": domainProof,
        Accept: "image/png, image/jpeg, image/svg+xml, image/*",
        "User-Agent": USER_AGENT,
        Referer: LOGIN_URL,
      },
    });

    if (!captchaRes.ok) {
      throw new Error(`Failed to fetch captcha: HTTP ${captchaRes.status}`);
    }

    const captchaBuffer = await captchaRes.arrayBuffer();
    const captchaImageBase64 = bytesToBase64(captchaBuffer);

    return {
      cookies: jar.getEntries(),
      nonce,
      domainFieldName,
      captchaFieldName,
      randomDelimiter,
      challengeId,
      fpNonce,
      dname,
      dataSrc,
      loadTime,
      captchaImageBase64,
    };
  }

  static async submitLoginAndScrape(
    session: StoredPortalSession,
    netId: string,
    pass: string,
    captcha: string
  ): Promise<StudentPortalData> {
    const jar = new CookieJar(session.cookies);
    const now = Date.now();
    const timeElapsed = Math.max(2, Math.floor((now - session.loadTime) / 1000));
    const interactCount = 18;

    const reversedHost = "sp.srmist.edu.in".split("").reverse().join("");
    const domainValue = btoa(reversedHost);
    const trapPayload = `${timeElapsed}${session.randomDelimiter}${interactCount}`;
    const captchaFieldValue = btoa(trapPayload);

    const telemetry = {
      startTime: session.loadTime,
      currentDomain: "sp.srmist.edu.in",
      timezoneOffset: -330,
      screenWidth: 1920,
      screenHeight: 1080,
      colorDepth: 24,
      devicePixelRatio: 1,
      platform: "Win32",
      userAgent: USER_AGENT,
      language: "en-US",
      hardwareConcurrency: 8,
      deviceMemory: 8,
      touchSupport: false,
      webdriver: false,
      mouseClicks: 4,
      mouseMovements: 20,
      keystrokeCount: 22,
      typingSpeedMs: 380,
      canvasHash: "6c9d2a",
      submitTime: now,
      timeOnPageMs: now - session.loadTime,
    };
    const telemetryPayload = btoa(encodeURIComponent(JSON.stringify(telemetry)));

    const formData = new URLSearchParams();
    formData.append("username", netId);
    formData.append("password", pass);
    formData.append("captcha", captcha);
    formData.append("challengeId", session.challengeId);
    formData.append("fpNonce", session.fpNonce);
    formData.append("fpPayload", "");
    formData.append("fpToken", "");
    formData.append("dname", session.dname);
    if (session.domainFieldName) formData.append(session.domainFieldName, domainValue);
    if (session.captchaFieldName) formData.append(session.captchaFieldName, captchaFieldValue);
    formData.append("telemetryPayload", telemetryPayload);

    const loginRes = await fetch(LOGIN_SERVLET_URL, {
      method: "POST",
      headers: {
        Cookie: jar.getHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Referer: LOGIN_URL,
        Origin: PORTAL_ORIGIN,
      },
      body: formData.toString(),
      redirect: "manual",
    });

    jar.setFromHeader(loginRes.headers.get("set-cookie"));
    const loc = loginRes.headers.get("location");

    if (!loc || loc.includes("youLogin.jsp")) {
      const responseHtml = await loginRes.text().catch(() => "");
      const errorText =
        responseHtml.match(/<div class="[^"]*error[^"]*">([\s\S]*?)<\/div>/i)?.[1] ||
        "Invalid credentials or incorrect captcha";
      throw new Error(cleanText(errorText));
    }

    // Step 2: Access HRDSystem.jsp
    const hrdRes = await fetch(HRD_SYSTEM_URL, {
      headers: {
        Cookie: jar.getHeader(),
        "User-Agent": USER_AGENT,
        Referer: HOME_URL,
      },
      redirect: "manual",
    });

    jar.setFromHeader(hrdRes.headers.get("set-cookie"));
    const hrdHtml = await hrdRes.text();

    const hiddenFields: Record<string, string> = {};
    const hiddenMatches = hrdHtml.matchAll(
      /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi
    );
    for (const m of hiddenMatches) {
      hiddenFields[m[1]] = m[2];
    }

    // Step 3: Fetch Attendance Details
    const attFormData = new URLSearchParams({
      ...hiddenFields,
      ddlReportType: "Student",
      ddlAttendanceFor: "Student",
      btnSubmit: "Submit",
      __EVENTTARGET: "",
      __EVENTARGUMENT: "",
      __LASTFOCUS: "",
    });

    const attPromise = fetch(ATTENDANCE_URL, {
      method: "POST",
      headers: {
        Cookie: jar.getHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Referer: HRD_SYSTEM_URL,
      },
      body: attFormData.toString(),
      redirect: "manual",
    }).then(async (res) => {
      jar.setFromHeader(res.headers.get("set-cookie"));
      return res.text();
    });

    // Step 4: Fetch All Semesters Marks & Credits (Form ID 8)
    const marksPromise = fetch(MARKS_CREDITS_URL, {
      method: "POST",
      headers: {
        Cookie: jar.getHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Referer: HRD_SYSTEM_URL,
      },
      body: new URLSearchParams({
        iden: "8",
        filter: "",
        hdnFormDetails: hiddenFields.hdnFormDetails || "1",
        csrfPreventionSalt: hiddenFields.csrfPreventionSalt || "",
      }).toString(),
      redirect: "manual",
    }).then(async (res) => {
      jar.setFromHeader(res.headers.get("set-cookie"));
      return res.text();
    });

    // Step 5: Fetch Internal Marks (Form ID 13)
    const internalMarksPromise = fetch(INTERNAL_MARKS_URL, {
      method: "POST",
      headers: {
        Cookie: jar.getHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Referer: HRD_SYSTEM_URL,
      },
      body: new URLSearchParams({
        iden: "13",
        filter: "",
        hdnFormDetails: hiddenFields.hdnFormDetails || "1",
        csrfPreventionSalt: hiddenFields.csrfPreventionSalt || "",
      }).toString(),
      redirect: "manual",
    }).then(async (res) => {
      jar.setFromHeader(res.headers.get("set-cookie"));
      return res.text();
    });

    const [attHtml, marksHtml, internalHtml] = await Promise.all([
      attPromise,
      marksPromise,
      internalMarksPromise,
    ]);

    const attendance = parseAttendanceTable(attHtml);
    const marks = parseMarksTable(marksHtml);
    const internalMarks = parseInternalMarksTable(internalHtml);

    // Map unified subjects
    const unifiedMap = new Map<string, UnifiedSubjectRecord>();

    for (const att of attendance) {
      unifiedMap.set(att.code, {
        code: att.code,
        name: att.name,
        attendance: {
          attended: att.attended,
          total: att.total,
          percentage: att.percentage,
        },
      });
    }

    for (const intMark of internalMarks) {
      if (unifiedMap.has(intMark.code)) {
        const item = unifiedMap.get(intMark.code)!;
        item.internalMarks = {
          markObtained: intMark.markObtained,
          maxMark: intMark.maxMark,
          rawText: intMark.rawMarkText,
        };
      } else {
        unifiedMap.set(intMark.code, {
          code: intMark.code,
          name: intMark.name,
          internalMarks: {
            markObtained: intMark.markObtained,
            maxMark: intMark.maxMark,
            rawText: intMark.rawMarkText,
          },
        });
      }
    }

    const attendanceOutput = normalizeAttendanceOutput(attendance, ATTENDANCE_URL);
    const marksOutput = normalizeMarksOutput(marks);
    const internalMarksOutput = normalizeInternalMarksOutput(internalMarks);

    return {
      attendance,
      attendanceOutput,
      marks,
      marksOutput,
      internalMarks,
      internalMarksOutput,
      unifiedSubjects: Array.from(unifiedMap.values()),
      sessionEntries: jar.getEntries(),
    };
  }
}
