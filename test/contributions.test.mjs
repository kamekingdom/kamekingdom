import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { fetchCalendar } from "../src/contributions.mjs";

const credentials = { username: "example", token: "test-token" };
const calendarResponse = (weeks) => ({
  data: { user: { contributionsCollection: { contributionCalendar: { weeks } } } },
});

test("calendar requests normalize partial weeks and relative levels", async () => {
  let requests = 0;
  const grid = await fetchCalendar({
    ...credentials,
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, "https://api.github.com/graphql");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "bearer test-token");
      assert.deepEqual(JSON.parse(options.body).variables, { login: "example" });
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(calendarResponse([
        { contributionDays: [
          { weekday: 5, contributionCount: 0 },
          { weekday: 6, contributionCount: 1 },
        ] },
        { contributionDays: [
          { weekday: 0, contributionCount: 2 },
          { weekday: 1, contributionCount: 4 },
          { weekday: 2, contributionCount: 10 },
        ] },
      ]));
    },
  });
  assert.equal(requests, 1);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].length, 7);
  assert.equal(0 in grid[0], false);
  assert.deepEqual(grid[0][5], { count: 0, level: 0 });
  assert.deepEqual(grid[0][6], { count: 1, level: 1 });
  assert.deepEqual(grid[1][0], { count: 2, level: 2 });
  assert.deepEqual(grid[1][1], { count: 4, level: 3 });
  assert.deepEqual(grid[1][2], { count: 10, level: 4 });
});

test("HTTP failures retain the status and do not retry", async () => {
  for (const status of [401, 403, 429, 500]) {
    let requests = 0;
    await assert.rejects(fetchCalendar({
      ...credentials,
      fetchImpl: async () => {
        requests++;
        return new Response("API unavailable", { status });
      },
    }), new RegExp(`GitHub API ${status}: API unavailable`));
    assert.equal(requests, 1);
  }
});

test("GraphQL failures and missing users have useful errors", async () => {
  await assert.rejects(fetchCalendar({
    ...credentials,
    fetchImpl: async () => Response.json({ errors: [{ message: "Query denied" }] }),
  }), /GraphQL error:.*Query denied/);
  await assert.rejects(fetchCalendar({
    ...credentials,
    fetchImpl: async () => Response.json({ data: { user: null } }),
  }), /No calendar for user "example"/);
});

test("a deadline aborts requests that stop before headers or during the response body", async (t) => {
  // Loopback only: exercise native fetch aborts without GitHub or real credentials.
  const server = createServer((request, response) => {
    if (request.url === "/body") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"data":');
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = once(server, "close");
    server.closeAllConnections();
    server.close();
    await closed;
  });
  const address = server.address();
  for (const endpoint of ["headers", "body"]) {
    let receivedHeaders = false;
    await assert.rejects(fetchCalendar({
      ...credentials,
      timeoutMs: 250,
      fetchImpl: async (_url, options) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/${endpoint}`, options);
        receivedHeaders = true;
        return response;
      },
    }), { name: "TimeoutError" });
    assert.equal(receivedHeaders, endpoint === "body");
  }
});

test("invalid timeout values fail before making a request", async () => {
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 2 ** 31, 2 ** 32]) {
    await assert.rejects(fetchCalendar({
      ...credentials,
      timeoutMs,
      fetchImpl: () => assert.fail("invalid timeout must not send a request"),
    }), { name: "RangeError" });
  }
});

test("invalid JSON and GraphQL response structures have actionable errors", async () => {
  for (const [response, message] of [
    [() => new Response('{"data":', { status: 200 }), /invalid JSON/],
    [() => Response.json(null), /JSON object/],
    [() => Response.json([]), /JSON object/],
    [() => Response.json({ errors: "invalid" }), /GraphQL errors field/],
    [() => Response.json(calendarResponse(null)), /weeks must be a non-empty array/],
    [() => Response.json(calendarResponse({})), /weeks must be a non-empty array/],
    [() => Response.json(calendarResponse([])), /weeks must be a non-empty array/],
    [() => Response.json(calendarResponse([null])), /contributionDays/],
    [() => Response.json(calendarResponse([{}])), /contributionDays/],
    [() => Response.json(calendarResponse([{ contributionDays: {} }])), /contributionDays/],
    [() => Response.json(calendarResponse([{ contributionDays: [] }])), /contributionDays/],
  ]) {
    await assert.rejects(fetchCalendar({ ...credentials, fetchImpl: async () => response() }), message);
  }
});

test("invalid day values and duplicate weekdays are rejected before rendering", async () => {
  const valid = { weekday: 0, contributionCount: 1 };
  const invalid = [
    null, {}, { ...valid, weekday: -1 }, { ...valid, weekday: 7 },
    { ...valid, weekday: 1.5 }, { ...valid, weekday: "0" },
    { ...valid, contributionCount: -1 }, { ...valid, contributionCount: 1.5 },
    { ...valid, contributionCount: "1" }, { ...valid, contributionCount: null },
    { ...valid, contributionCount: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const day of invalid) {
    await assert.rejects(fetchCalendar({
      ...credentials,
      fetchImpl: async () => Response.json(calendarResponse([{ contributionDays: [day] }])),
    }), /invalid weekday|invalid contributionCount/);
  }
  for (const days of [[valid, valid], Array(8).fill(valid)]) {
    await assert.rejects(fetchCalendar({
      ...credentials,
      fetchImpl: async () => Response.json(calendarResponse([{ contributionDays: days }])),
    }), /duplicate weekday|1 to 7/);
  }
});

test("zero contributions and an empty GraphQL errors array remain valid", async () => {
  const json = calendarResponse([{ contributionDays: [{ weekday: 6, contributionCount: 0 }] }]);
  const grid = await fetchCalendar({ ...credentials, fetchImpl: async () => Response.json({ ...json, errors: [] }) });
  assert.deepEqual(grid[0][6], { count: 0, level: 0 });
  assert.equal(0 in grid[0], false);
});

test("tokens in upstream responses, errors, and cached stacks never reach diagnostics", async () => {
  const token = 'test-secret"/token';
  for (const fetchImpl of [
    async () => new Response(`Unauthorized ${token}`, { status: 401 }),
    async () => Response.json({ errors: [{ message: `Denied ${token}` }] }),
    async () => {
      const error = new Error(`Network failure ${encodeURIComponent(token)}`);
      error.cause = new Error(token);
      void error.stack;
      throw error;
    },
  ]) {
    await assert.rejects(fetchCalendar({ username: "example", token, fetchImpl }), (error) => {
      assert.match(error.message, /\[REDACTED\]/);
      assert.ok(!error.stack.includes(token));
      assert.ok(!error.stack.includes(JSON.stringify(token).slice(1, -1)));
      assert.ok(!error.stack.includes(encodeURIComponent(token)));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
