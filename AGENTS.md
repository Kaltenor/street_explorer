# Agent Instructions

These instructions apply to the entire repository.

## Project Sources of Truth

- The canonical application version is the version field in package.json and uses semantic versioning.
- Keep the root entries in package-lock.json, expo.version in app.json, ios.buildNumber, and android.versionCode synchronized with a release change. The numeric iOS and Android build identifiers must increase monotonically.
- User and developer documentation lives in README.md and docs/*.md. This repository currently has no generated Markdown mirror.
- The standard local validation command is npm run typecheck.
- Exploration contour, loop-fill, and large-surface regression checks run with npm run test:geometry.
- For changes that can affect the Expo bundle or assets, also run npx expo export --platform ios --output-dir <temporary-directory> when practical.
- Physical-device development builds are available through npm run build:ios:dev; simulator builds use npm run build:ios:sim. These remote, credentialed builds should only be run when requested or needed for release/device validation.
- There is no full automated test or lint suite. Run npm run test:geometry for exploration changes, follow the relevant manual procedures in docs/TESTING.md, and do not claim that nonexistent checks were run.

## Version Discipline

Before making any code, asset, content, configuration, build, release, schema, tool, or user-visible change:

1. Read these repository instructions.
2. Check the canonical version in package.json.
3. Determine whether the requested work requires a version increment.
4. If it does, increment the version as part of the same change before considering the work complete.
5. Use the smallest appropriate semantic-version increment and default to a patch increment unless the change clearly requires a minor or major increment.
6. Synchronize all required duplicate version declarations listed under Project Sources of Truth.
7. Report the version check in the final response, including the previous and new versions.

A qualifying change is not complete until the version check has been performed. Never silently skip versioning.

Pure investigation, explanation, code review, validation, or status reporting does not require a version increment when no project file or behavior is changed.

## Feature Clarification - Exactly Three Questions

For every new non-trivial feature, ask exactly three clarifying questions before implementation.

Requirements:

- Ask all three questions together in one message.
- Make each question concrete and relevant to a decision that could materially affect the implementation.
- Do not begin implementation until the user has answered.
- Do not ask fewer or more than three questions.
- After receiving the answers, make reasonable minor assumptions instead of starting another clarification round.
- Summarize important assumptions when beginning implementation.

Do not trigger the three-question requirement for:

- Trivial edits.
- Small or clearly scoped bug fixes.
- Direct commands with an unambiguous outcome.
- Investigation, review, explanation, or validation requests.
- Work whose expected behavior and design are already fully specified.

## Documentation Sync

Whenever a change affects behavior, code, assets, configuration, schemas, builds, releases, tools, workflows, or user-facing functionality, update the relevant Markdown documentation in the same change.

Update docs/CHANGELOG.md for release-worthy changes. Keep README.md, docs/ARCHITECTURE.md, docs/PROJECT_OVERVIEW.md, docs/DEVELOPMENT_BUILD.md, docs/TESTING.md, and docs/ROADMAP.md consistent whenever the areas they describe change.

Only reference documentation mirrors or generated context folders if they actually exist. If one is introduced later, keep it synchronized.

## Completion and Validation

Before declaring implementation complete:

1. Run the relevant available typecheck, bundle, build, and manual validation for the changed area.
2. Report which checks passed and which could not be run.
3. Confirm documentation was updated when required.
4. Confirm the version was checked and incremented when required.
5. Do not claim completion while required validation, documentation, or versioning remains unfinished.

Preserve unrelated user changes in a dirty worktree. Do not stage, commit, restore, or discard files unless the user explicitly requests it.
