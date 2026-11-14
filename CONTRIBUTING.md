# Development

This repository contains the GitHub profile README and its Pac-Man contribution
SVG generator. Tests, profile synchronization, and contribution generation use Node.js alone.
Regenerating the committed Tech Stack badge images uses the pinned development tools in package-lock.json.

To choose which technologies appear on the profile, use the
[Tech Stack management checklist](https://github.com/kamekingdom/kamekingdom/issues/9).
See the [management guide](docs/tech-stack.md) to add catalog entries or troubleshoot synchronization.

## Run locally

Use Node.js 22, matching [.nvmrc](.nvmrc) and the workflows. If you use nvm,
run `nvm use` first. No `npm install` is needed.

```sh
npm test
npm run demo
```

The demo needs no credentials or network access. It writes
`dist/pacman-contributions.svg`; open that file in a browser to inspect the
animation in light and dark mode. `dist/` is ignored by Git.

The tests cover empty and single-day calendars, route continuity and cell
coverage, 49 combinations of partial first and last weeks, reproducible
rendering, fade timing, and CLI success and failure paths.

To fetch live data, provide `GITHUB_TOKEN` through your local environment and run:

```sh
npm run build -- --user kamekingdom
```

Never put a token in repository files, screenshots, or issue logs. The live API
path is separate from the offline checks. The API error-handling work is
tracked in [#3](https://github.com/kamekingdom/kamekingdom/issues/3).

Live requests have a 15-second deadline covering the response headers and body.
`fetchCalendar` accepts `timeoutMs` for callers that need a different deadline.
It sends one request without automatic retries; timeout failures preserve the
`TimeoutError` name. The API tests use injected responses and a loopback HTTP
server, so they do not contact GitHub or need real credentials.

Malformed JSON, calendar structure, duplicate weekdays, and invalid day values
are rejected with descriptive errors. Tokens are redacted from reported API and
network errors. If a live build fails, check the HTTP status or validation error,
confirm the username and token permissions, and retry once the cause is fixed.
The CLI fetches and validates data before writing the SVG, so API failures leave
an existing output file unchanged.

## Make a change

1. Open an issue with the current behavior, expected behavior, and acceptance criteria.
2. Create a branch with one clear purpose, such as `fix/svg-timing`.
3. Add regression coverage when fixing generator behavior.
4. Run `npm test` and `npm run demo`, and inspect the generated SVG when visuals change.
5. Open a PR linking the issue and recording the commands, results, and limitations.

Keep the [third-party attribution](THIRD_PARTY_NOTICES.md) when changing adapted code.
See [the architecture notes](docs/architecture.md) for the generator's boundaries
and fallback behavior.

## Validation and publication

[validate.yml](.github/workflows/validate.yml) runs on pull requests and pushes to
`main`. It runs offline with read-only repository permissions and does not pass
a GitHub token to the generator or publish the result.

[pacman-contributions.yml](.github/workflows/pacman-contributions.yml) fetches
live data and publishes the SVG to the `output` branch on the scheduled, manual,
or configured `main` push triggers. Its cron expression is `17 3 * * *` (UTC).
Changes on a PR branch do not update the public profile image.

If Actions cannot start, run the offline commands above and record their output
and Node.js version in the PR. For a local live-data preview, use the build
command above. A successful local preview does not establish that publication
or scheduled execution works. Track execution restrictions and the next
successful publication in [#4](https://github.com/kamekingdom/kamekingdom/issues/4).
