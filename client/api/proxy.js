// Keep browser cookies same-origin while the persistent API runs elsewhere.
export default async function proxy(request, response) {
  const fail = (status, code, message) =>
    response
      .status(status)
      .json({ error: { code, message, requestId: "frontend-proxy" } });
  let backend;
  try {
    backend = new URL(process.env.BACKEND_URL || "");
    if (
      backend.protocol !== "https:" ||
      backend.username ||
      backend.password ||
      backend.pathname !== "/" ||
      backend.search ||
      backend.hash
    )
      throw new Error("Invalid backend");
  } catch {
    return fail(
      503,
      "BACKEND_NOT_CONFIGURED",
      "The backend address needs to be configured on the deployment.",
    );
  }
  const path = request.query?.upstreamPath;
  if (
    typeof path !== "string" ||
    !path.startsWith("v1/") ||
    path.includes("..") ||
    path.includes("\\") ||
    !/^[A-Za-z0-9_/%.-]+$/.test(path)
  )
    return fail(400, "INVALID_PATH", "This API path is invalid.");
  const target = new URL(`/api/${path}`, backend);
  if (
    target.origin !== backend.origin ||
    !target.pathname.startsWith("/api/v1/")
  )
    return fail(400, "INVALID_PATH", "This API path is invalid.");
  if (!["GET", "POST"].includes(request.method))
    return fail(405, "METHOD_NOT_ALLOWED", "This method is not supported.");
  const headers = new Headers();
  for (const name of [
    "content-type",
    "cookie",
    "origin",
    "x-csrf-token",
    "idempotency-key",
  ]) {
    const value = request.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  let body;
  if (request.method === "POST") {
    body =
      typeof request.body === "string" || Buffer.isBuffer(request.body)
        ? request.body
        : JSON.stringify(request.body ?? {});
    if (Buffer.byteLength(body) > 16384)
      return fail(
        413,
        "PAYLOAD_TOO_LARGE",
        "The request payload is too large.",
      );
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return fail(
        502,
        "UPSTREAM_REDIRECT",
        "The backend returned an unexpected redirect.",
      );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    const cookies = upstream.headers.getSetCookie();
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response
      .status(upstream.status)
      .send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return fail(
      503,
      "BACKEND_UNAVAILABLE",
      "The backend is starting or unavailable. Please try again shortly.",
    );
  }
}
