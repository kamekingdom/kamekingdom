#!/usr/bin/env python3
"""Generate an animated SVG of a turtle eating GitHub contributions."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


API_URL = "https://api.github.com/graphql"
CELL = 14
GRID_X = 74
GRID_Y = 42
MOVE_SECONDS = 28
SLEEP_SECONDS = 5

QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
            weekday
          }
        }
      }
    }
  }
}
"""


def fetch_calendar(user: str, token: str) -> list[dict]:
    payload = json.dumps({"query": QUERY, "variables": {"login": user}}).encode()
    request = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "turtle-contribution-generator",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"GitHub API returned {error.code}: {detail}") from error

    if result.get("errors"):
        raise RuntimeError(f"GitHub API error: {result['errors']}")
    user_data = result.get("data", {}).get("user")
    if not user_data:
        raise RuntimeError(f"GitHub user not found: {user}")
    return user_data["contributionsCollection"]["contributionCalendar"]["weeks"]


def sample_calendar() -> list[dict]:
    """Offline data used only for local preview/testing."""
    levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"]
    weeks = []
    for week in range(53):
        days = []
        for day in range(7):
            value = ((week * 7 + day * 11) % 17) // 4 if (week + day) % 4 else 0
            days.append({
                "weekday": day,
                "contributionCount": value,
                "contributionLevel": levels[min(value, 4)],
            })
        weeks.append({"contributionDays": days})
    return weeks


def svg_for(weeks: list[dict], user: str) -> str:
    # Keep enough room for the sleeping turtle's floating Zs at the final cell.
    width = GRID_X + len(weeks) * CELL + 46
    height = GRID_Y + 7 * CELL + 34
    cycle = MOVE_SECONDS + SLEEP_SECONDS
    move_end = MOVE_SECONDS / cycle
    cells: list[dict] = []

    for week_index, week in enumerate(weeks):
        for day in week["contributionDays"]:
            cells.append({
                **day,
                "x": GRID_X + week_index * CELL,
                "y": GRID_Y + int(day["weekday"]) * CELL,
                "week": week_index,
            })

    active = [cell for cell in cells if int(cell["contributionCount"]) > 0]
    # Read rows left-to-right, then right-to-left, so the turtle meanders naturally.
    active.sort(key=lambda cell: (cell["weekday"], cell["week"] if cell["weekday"] % 2 == 0 else -cell["week"]))

    if active:
        start = (GRID_X - 44, active[0]["y"] + 5)
        points = [start] + [(cell["x"] + 5, cell["y"] + 5) for cell in active]
    else:
        points = [(GRID_X - 44, GRID_Y + 47), (GRID_X + 5, GRID_Y + 47)]
    path = "M " + " L ".join(f"{x} {y}" for x, y in points)
    finish_x, finish_y = points[-1]
    segment_lengths = [
        math.hypot(x2 - x1, y2 - y1)
        for (x1, y1), (x2, y2) in zip(points, points[1:])
    ]
    route_length = sum(segment_lengths) or 1
    arrival_fractions = []
    distance = 0.0
    for segment_length in segment_lengths:
        distance += segment_length
        arrival_fractions.append(distance / route_length)

    output = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
  <title id="title">{user}'s contribution graph, eaten by a turtle</title>
  <desc id="desc">An animated turtle slowly eats the contribution cells and falls asleep.</desc>
  <style>
    :root {{ --empty:#ebedf0; --q1:#9be9a8; --q2:#40c463; --q3:#30a14e; --q4:#216e39; --text:#57606a; }}
    @media (prefers-color-scheme: dark) {{
      :root {{ --empty:#161b22; --q1:#0e4429; --q2:#006d32; --q3:#26a641; --q4:#39d353; --text:#8b949e; }}
    }}
    .cell {{ rx:2px; stroke:rgba(27,31,36,.06); stroke-width:1px; }}
    .label {{ fill:var(--text); font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    .turtle {{ transform-box:fill-box; transform-origin:center; }}
  </style>
  <text class="label" x="{GRID_X}" y="21">{user}'s contributions</text>
  <g aria-hidden="true">''']

    level_vars = {
        "NONE": "--empty",
        "FIRST_QUARTILE": "--q1",
        "SECOND_QUARTILE": "--q2",
        "THIRD_QUARTILE": "--q3",
        "FOURTH_QUARTILE": "--q4",
    }
    active_index = {id(cell): index for index, cell in enumerate(active)}
    for cell in cells:
        color = level_vars.get(cell["contributionLevel"], "--empty")
        line = f'    <rect class="cell" x="{cell["x"]}" y="{cell["y"]}" width="10" height="10" fill="var({color})"'
        if id(cell) in active_index:
            index = active_index[id(cell)]
            eaten_at = move_end * arrival_fractions[index]
            line += f'><animate attributeName="opacity" dur="{cycle}s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;{eaten_at:.5f};{eaten_at:.5f};1"/></rect>'
        else:
            line += "/>"
        output.append(line)

    output.append(f'''  </g>
  <g aria-hidden="true" opacity="1">
    <animate attributeName="opacity" dur="{cycle}s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;{move_end:.5f};{move_end:.5f};1"/>
    <g class="turtle" transform="translate(-21 -14)">
      <ellipse cx="20" cy="14" rx="14" ry="10" fill="#2da44e" stroke="#1b6f3a" stroke-width="2"/>
      <path d="M11 8l9 12 9-12M8 14h24" fill="none" stroke="#74c991" stroke-width="1.5" opacity=".8"/>
      <circle cx="36" cy="14" r="6" fill="#74c991" stroke="#1b6f3a" stroke-width="1.5"/>
      <circle cx="38" cy="12" r="1.2" fill="#172b1d"/>
      <ellipse cx="9" cy="4" rx="4" ry="2.5" fill="#74c991" transform="rotate(-28 9 4)"/>
      <ellipse cx="9" cy="24" rx="4" ry="2.5" fill="#74c991" transform="rotate(28 9 24)"/>
      <ellipse cx="28" cy="4" rx="4" ry="2.5" fill="#74c991" transform="rotate(28 28 4)"/>
      <ellipse cx="28" cy="24" rx="4" ry="2.5" fill="#74c991" transform="rotate(-28 28 24)"/>
      <path d="M5 14L0 11v6z" fill="#74c991"/>
    </g>
    <animateMotion dur="{cycle}s" repeatCount="indefinite" path="{path}" rotate="auto" keyPoints="0;1;1" keyTimes="0;{move_end:.5f};1" calcMode="linear"/>
  </g>
  <g aria-hidden="true" transform="translate({finish_x - 21} {finish_y - 14})" opacity="0">
    <animate attributeName="opacity" dur="{cycle}s" repeatCount="indefinite" values="0;0;1;1" keyTimes="0;{move_end:.5f};{move_end:.5f};1"/>
    <ellipse cx="20" cy="16" rx="15" ry="9" fill="#2da44e" stroke="#1b6f3a" stroke-width="2"/>
    <circle cx="35" cy="17" r="6" fill="#74c991" stroke="#1b6f3a" stroke-width="1.5"/>
    <path d="M33 17q2 2 4 0" fill="none" stroke="#172b1d" stroke-width="1.2" stroke-linecap="round"/>
    <text x="40" y="7" font-size="13" font-weight="700" fill="var(--text)">Z</text>
    <text x="49" y="0" font-size="10" font-weight="700" fill="var(--text)">Z</text>
    <text x="56" y="-6" font-size="8" font-weight="700" fill="var(--text)">Z</text>
  </g>
</svg>
''')
    return "\n".join(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", default=os.environ.get("GITHUB_REPOSITORY_OWNER"))
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"))
    parser.add_argument("--output", type=Path, default=Path("dist/turtle-contributions.svg"))
    parser.add_argument("--sample", action="store_true", help="generate an offline preview")
    args = parser.parse_args()

    if not args.user:
        parser.error("--user or GITHUB_REPOSITORY_OWNER is required")
    if not args.sample and not args.token:
        parser.error("--token or GITHUB_TOKEN is required (unless --sample is used)")

    try:
        weeks = sample_calendar() if args.sample else fetch_calendar(args.user, args.token)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(svg_for(weeks, args.user), encoding="utf-8")
    except (OSError, RuntimeError) as error:
        print(error, file=sys.stderr)
        return 1
    print(f"Generated {args.output} for {args.user}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
