function collectSetCookieHeaders(response: Response): string[] {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .join("; ");
}

export async function signInWithForm(astroOrigin: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${astroOrigin}/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: astroOrigin,
    },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  });

  const setCookies = collectSetCookieHeaders(response);
  const cookieHeader = cookieHeaderFromSetCookies(setCookies);
  if (!cookieHeader) {
    throw new Error(`Sign-in did not return session cookies (status ${response.status})`);
  }

  return cookieHeader;
}

export async function fetchUnknownJson(
  url: string,
  init: RequestInit & { cookieHeader?: string; origin?: string },
): Promise<{ response: Response; body: unknown }> {
  const headers = new Headers(init.headers);
  if (init.cookieHeader) {
    headers.set("Cookie", init.cookieHeader);
  }
  if (init.origin) {
    headers.set("Origin", init.origin);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  let body: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await response.json()) as unknown;
  }

  return { response, body };
}

export async function fetchAuthedHtml(
  url: string,
  cookieHeader: string,
): Promise<{ response: Response; body: string }> {
  const response = await fetch(url, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });

  return { response, body: await response.text() };
}

export async function postFormWithManualRedirect(
  url: string,
  fields: Record<string, string>,
  cookieHeader: string,
  origin?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: cookieHeader,
  };
  if (origin !== undefined) {
    headers.Origin = origin;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
    redirect: "manual",
  });

  collectSetCookieHeaders(response);
  return response;
}
