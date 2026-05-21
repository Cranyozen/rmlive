# Contributing to RMLive

Thank you for your interest in RMLive. This project serves live competition broadcasts, so changes should prioritize playback stability, mobile behavior, real-time data correctness, and reliable deployment updates.

## Ways to Contribute

You can help by:

- reporting bugs
- proposing features
- fixing defects
- improving documentation
- refining mobile, player, PWA, danmaku, engagement, or match-data workflows

## Code of Conduct

Be respectful and constructive. Assume good intent, keep discussions focused on the technical problem, and avoid personal attacks. Maintainers may close or hide comments that are abusive, spammy, or unrelated to the project.

## Reporting Issues

When opening an issue, please include:

- a clear description of the problem
- steps to reproduce
- expected behavior
- actual behavior
- device, operating system, browser, and browser version
- whether the issue happens in a normal browser, PWA, iframe, or in-app browser
- screenshots, recordings, or console logs when useful

For playback and mobile issues, also include:

- portrait or landscape orientation
- fullscreen state
- network conditions
- selected stream, quality, and angle
- whether the page refreshed, playback stalled, paused unexpectedly, or failed to recover

## Development Setup

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Start with local mock data:

```bash
pnpm dev:mock
```

Build all production artifacts:

```bash
pnpm build:all
```

## Pull Request Guidelines

Before opening a pull request:

- keep the scope focused
- avoid unrelated formatting or refactoring
- follow the existing architecture and coding style
- explain user-visible behavior changes
- document risks for player, PWA, deployment, polling, or mobile changes
- do not commit secrets, local environment files, generated build output, or temporary files

Recommended workflow:

1. Create a branch from the latest target branch.
2. Make focused commits with clear messages.
3. Run the relevant local checks.
4. Open a pull request with a summary, motivation, validation steps, and known risks.

## Validation

For most changes, run:

```bash
pnpm lint
pnpm test:run
pnpm build:all
```

For style changes, also run:

```bash
pnpm stylelint
```

If a check cannot be run, explain why in the pull request.

## Coding Guidelines

- Use TypeScript and the Vue 3 Composition API.
- Reuse existing Pinia stores, utilities, and component patterns.
- Prefer existing project conventions over new abstractions.
- Keep abstractions small and justified.
- Do not duplicate capabilities already provided by Artplayer outside the player unless there is a clear reason.
- Keep live JSON, HLS streams, and real-time APIs network-first or `no-store`; they must not be cached by the service worker.
- Test mobile behavior across portrait, landscape, fullscreen, PWA, iframe, and in-app browser contexts when relevant.
- Update `.env.example` and `README.md` when adding or changing environment variables.

## Commit Messages

Use short imperative messages, for example:

- `fix mobile fullscreen detection`
- `update pwa cache strategy`
- `document deployment variables`

Chinese commit messages are acceptable if they are clear and concise.

## Security

Do not publish sensitive information in issues, pull requests, commits, screenshots, or logs. This includes:

- cloud service credentials
- LeanCloud application secrets
- access tokens or cookies
- private user data
- unpublished internal competition data

If you believe you have found a security issue, contact the maintainers privately instead of opening a public issue with exploit details.

## License

By contributing to RMLive, you agree that your contributions will be licensed under the GNU General Public License v3.0, and you confirm that you have the right to submit the contributed code, documentation, or assets.
