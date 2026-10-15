// CSP（Content-Security-Policy-Report-Only）の違反報告の受け口。ブラウザが自動で送る。ログに出すだけで、保存はしない。
// 公開のため、本文は小さく切り、URL のクエリは落とす（トークン等がログに残らないように）。
export default defineEventHandler(async (event) => {
  try {
    const raw = (await readRawBody(event)) ?? "";
    const parsed = JSON.parse(raw.slice(0, 4000));
    const r = parsed?.["csp-report"] ?? (Array.isArray(parsed) ? parsed[0]?.body : parsed) ?? {};
    const strip = (v: unknown) => (typeof v === "string" ? v.split("?")[0].split("#")[0].slice(0, 200) : undefined);
    console.warn("[csp]", {
      directive: String(r["violated-directive"] ?? r.effectiveDirective ?? "").slice(0, 80),
      blocked: strip(r["blocked-uri"] ?? r.blockedURL),
      document: strip(r["document-uri"] ?? r.documentURL),
    });
  } catch {
    /* 形式が違う報告は無視する */
  }
  setResponseStatus(event, 204);
  return null;
});
