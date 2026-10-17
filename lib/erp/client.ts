/**
 * Minimal HTTP client for the JUNO Campus ERP used by VCET (erp.vcet.edu.in).
 *
 * The ERP uses Spring Security form login:
 *   POST /j_spring_security_check  (j_username, j_password)
 * followed by a session cookie (JSESSIONID). All student data is exposed as
 * JSON endpoints prefixed with "stu_".
 */

export class ErpAuthError extends Error {
  constructor(message = "ERP rejected the username or password") {
    super(message);
    this.name = "ErpAuthError";
  }
}

export class ErpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpError";
  }
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 ERPReminder/1.0";

export class ErpClient {
  private cookies = new Map<string, string>();
  readonly base: string;

  constructor(base = process.env.ERP_BASE_URL || "https://erp.vcet.edu.in") {
    this.base = base.replace(/\/+$/, "");
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeCookies(res: Response) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  /** fetch with cookie jar and manual redirect following (so cookies on 302s are kept). */
  private async request(path: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
    // maxRedirects = 0 → return the 3xx response itself (caller inspects Location)
    let url = path.startsWith("http") ? path : `${this.base}/${path.replace(/^\/+/, "")}`;
    let opts: RequestInit = init;
    for (let i = 0; i <= maxRedirects; i++) {
      const res = await fetch(url, {
        ...opts,
        redirect: "manual",
        signal: AbortSignal.timeout(25_000),
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/javascript, text/html, */*; q=0.01",
          ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
          ...(opts.headers || {}),
        },
      });
      this.storeCookies(res);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location") && i < maxRedirects) {
        url = this.resolveRedirect(res.headers.get("location")!, url);
        opts = { method: "GET" };
        await res.arrayBuffer().catch(() => undefined);
        continue;
      }
      // expose the final URL even though we followed redirects manually
      Object.defineProperty(res, "finalUrl", { value: url });
      return res;
    }
    throw new ErpError("Too many redirects from ERP");
  }

  /** Resolve a Location header; upgrade same-host http:// redirects to https (the ERP sometimes emits them). */
  private resolveRedirect(location: string, from: string): string {
    const u = new URL(location, from);
    const base = new URL(this.base);
    if (u.hostname === base.hostname && base.protocol === "https:" && u.protocol === "http:") {
      u.protocol = "https:";
      u.port = "";
    }
    return u.toString();
  }

  async login(username: string, password: string): Promise<void> {
    // 1. Load login page to obtain a session cookie
    const pre = await this.request("login.htm");
    await pre.arrayBuffer();
    if (!pre.ok) throw new ErpError(`ERP login page returned HTTP ${pre.status}`);

    // 2. Submit credentials. Don't follow the redirect: its target tells us success/failure.
    const body = new URLSearchParams({ j_username: username, j_password: password });
    const res = await this.request(
      "j_spring_security_check",
      {
        method: "POST",
        body: body.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: this.base,
          Referer: `${this.base}/login.htm`,
        },
      },
      0,
    );
    const location = res.headers.get("location") || "";
    const text = await res.text();
    if (/login\.htm|login_error|error|failure/i.test(location)) throw new ErpAuthError();
    if (res.status === 200 && /isError:\s*true|j_spring_security_check/.test(text)) throw new ErpAuthError();

    // Best effort: open the home page like a browser would (initialises some session data)
    if (location) {
      await this.request(this.resolveRedirect(location, `${this.base}/j_spring_security_check`))
        .then((r) => r.arrayBuffer())
        .catch(() => undefined);
    }

    // 3. Confirm we really have a student session
    const terms = await this.getJson<unknown>("stu_getTermsOfStudentForCourceFile.json");
    if (!Array.isArray(terms)) throw new ErpAuthError("Logged in, but this does not look like a student account");
  }

  /** GET a JSON endpoint. Throws ErpAuthError if the session is not valid (HTML login page returned). */
  async getJson<T>(path: string): Promise<T> {
    const res = await this.request(path, { headers: { "X-Requested-With": "XMLHttpRequest" } }, 0);
    if (res.status >= 300 && res.status < 400) {
      await res.arrayBuffer().catch(() => undefined);
      throw new ErpAuthError("ERP session is not logged in (redirected to login)");
    }
    const text = await res.text();
    if (!res.ok) throw new ErpError(`ERP ${path} returned HTTP ${res.status}`);
    const trimmed = text.trim();
    if (trimmed.startsWith("<")) throw new ErpAuthError("ERP returned a web page instead of data (not logged in)");
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new ErpError(`ERP ${path} returned invalid JSON`);
    }
  }

  async logout(): Promise<void> {
    try {
      const r = await this.request("logout.json");
      await r.arrayBuffer();
    } catch {
      /* ignore */
    }
  }
}
