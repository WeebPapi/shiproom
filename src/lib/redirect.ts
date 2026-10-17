/** Accepts only same-origin absolute paths, so `next` parameters cannot redirect off-site. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "http://localhost");
    return url.host === "localhost" ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}
