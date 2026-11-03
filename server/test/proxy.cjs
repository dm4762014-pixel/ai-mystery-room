const { test, afterEach, before } = require("node:test");
const assert = require("node:assert/strict");
let proxy;
before(async () => {
  proxy = (await import("../../client/api/proxy.js")).default;
});
const originalFetch = global.fetch;
const originalBackend = process.env.BACKEND_URL;
afterEach(() => {
  global.fetch = originalFetch;
  if (originalBackend === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalBackend;
});
function response() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(body) {
      this.body = body;
    },
    send(body) {
      this.body = body;
    },
  };
}
test("forwards session and CSRF headers and preserves secure cookies without caching", async () => {
  process.env.BACKEND_URL = "https://example.onrender.com";
  global.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://example.onrender.com/api/v1/sessions/guest",
    );
    assert.equal(init.headers.get("origin"), "https://game.vercel.app");
    assert.equal(init.headers.get("x-csrf-token"), "csrf-test");
    assert.equal(init.headers.get("cookie"), "mystery_guest=test");
    assert.equal(init.headers.get("authorization"), null);
    return new Response('{"ok":true}', {
      status: 201,
      headers: {
        "content-type": "application/json",
        "set-cookie":
          "mystery_guest=test; HttpOnly; Secure; SameSite=Lax; Path=/",
      },
    });
  };
  const result = response();
  await proxy(
    {
      method: "POST",
      query: { upstreamPath: "v1/sessions/guest" },
      body: {},
      headers: {
        origin: "https://game.vercel.app",
        "x-csrf-token": "csrf-test",
        cookie: "mystery_guest=test",
        authorization: "do-not-forward",
      },
    },
    result,
  );
  assert.equal(result.statusCode, 201);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.match(result.headers["Set-Cookie"][0], /Secure/);
});
test("rejects unconfigured upstream, traversal and oversize bodies before contacting a host", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("must not fetch");
  };
  delete process.env.BACKEND_URL;
  let result = response();
  await proxy(
    { query: { upstreamPath: "v1/cases" }, headers: {}, method: "GET" },
    result,
  );
  assert.equal(result.statusCode, 503);
  process.env.BACKEND_URL = "https://example.onrender.com";
  result = response();
  await proxy(
    { query: { upstreamPath: "v1/../../private" }, headers: {}, method: "GET" },
    result,
  );
  assert.equal(result.statusCode, 400);
  result = response();
  await proxy(
    {
      query: { upstreamPath: "v1/cases" },
      headers: {},
      method: "POST",
      body: "a".repeat(17000),
    },
    result,
  );
  assert.equal(result.statusCode, 413);
  assert.equal(calls, 0);
});
test("sanitizes backend failures", async () => {
  process.env.BACKEND_URL = "https://example.onrender.com";
  global.fetch = async () => {
    throw new Error("private key details");
  };
  const result = response();
  await proxy(
    { method: "GET", query: { upstreamPath: "v1/health/ready" }, headers: {} },
    result,
  );
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.error.code, "BACKEND_UNAVAILABLE");
  assert.ok(!JSON.stringify(result.body).includes("private key"));
});
