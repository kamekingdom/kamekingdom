// Fetch a user's contribution calendar from the GitHub GraphQL API and turn it
// into a simple grid: grid[week][day] = { count, level } where level is 0..4.

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            weekday
          }
        }
      }
    }
  }
}`;

function toLevel(count, max) {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const q = count / max;
  if (q > 0.66) return 4;
  if (q > 0.33) return 3;
  if (q > 0.15) return 2;
  return 1;
}

export async function fetchCalendar({ username, token, timeoutMs = 15_000, fetchImpl = fetch }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2 ** 31 - 1) {
    throw new RangeError("timeoutMs must be an integer from 1 to 2147483647");
  }
  try {
    // The signal also bounds response-body reads when using the native fetch.
    const res = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "pacman-contribution-graph",
      },
      body: JSON.stringify({ query: QUERY, variables: { login: username } }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    let json;
    try {
      json = await res.json();
    } catch (error) {
      if (["TimeoutError", "AbortError"].includes(error.name)) throw error;
      throw new Error("GitHub API returned invalid JSON");
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new Error("GitHub API response must be a JSON object");
    }
    if (json.errors !== undefined && !Array.isArray(json.errors)) {
      throw new Error("GitHub API returned an invalid GraphQL errors field");
    }
    if (json.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);

    const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
    if (weeks === undefined) throw new Error(`No calendar for user "${username}"`);
    return normalizeWeeks(weeks);
  } catch (error) {
    // Create a fresh exception so an upstream stack or cause cannot expose the token.
    let message = String(error?.message ?? error);
    if (typeof token === "string" && token.length > 0) {
      const secrets = new Set([token, JSON.stringify(token).slice(1, -1), encodeURIComponent(token)]);
      for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
        message = message.split(secret).join("[REDACTED]");
      }
    }
    const safe = new Error(message.slice(0, 500));
    if (["Error", "TypeError", "RangeError", "TimeoutError", "AbortError"].includes(error?.name)) {
      safe.name = error.name;
    }
    throw safe;
  }
}

function normalizeWeeks(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    throw new Error("GitHub calendar weeks must be a non-empty array");
  }
  let max = 1;
  const counts = weeks.map((week, weekIndex) => {
    const days = week?.contributionDays;
    if (!Array.isArray(days) || days.length === 0 || days.length > 7) {
      throw new Error(`GitHub calendar week ${weekIndex} must contain 1 to 7 contributionDays`);
    }
    const column = new Array(7);
    for (const day of days) {
      if (!Number.isInteger(day?.weekday) || day.weekday < 0 || day.weekday > 6) {
        throw new Error(`GitHub calendar week ${weekIndex} has an invalid weekday`);
      }
      if (!Number.isSafeInteger(day.contributionCount) || day.contributionCount < 0) {
        throw new Error(`GitHub calendar week ${weekIndex} has an invalid contributionCount`);
      }
      if (day.weekday in column) {
        throw new Error(`GitHub calendar week ${weekIndex} has a duplicate weekday`);
      }
      column[day.weekday] = day.contributionCount;
      max = Math.max(max, day.contributionCount);
    }
    return column;
  });
  return counts.map((column) => column.map((count) => ({ count, level: toLevel(count, max) })));
}

export function demoCalendar() {
  const grid = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let week = 0; week < 53; week++) {
    const column = new Array(7);
    const days = week === 52 ? 4 : 7;
    for (let day = 0; day < days; day++) {
      const value = random();
      const level = value < 0.45 ? 0 : value < 0.6 ? 1 : value < 0.78 ? 2 : value < 0.92 ? 3 : 4;
      column[day] = { count: level * 3, level };
    }
    grid.push(column);
  }
  return grid;
}
