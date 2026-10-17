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

/** PKCE cookies belong to the origin that started sign-in. */
export function authCallbackUrl(origin: string, next: string): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(next));
  return callback.toString();
}
