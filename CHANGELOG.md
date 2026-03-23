# Changelog

## [0.2.26] - 2026-03-23

- Added optimistic concurrency control for objects: the client now caches weak ETags from GET /objects/{id} and sends them as `If-Match` headers on PATCH requests; introduces `ObjectPreconditionFailedError` (HTTP 412) for callers to handle merge conflicts by refetching and retrying.
- Changed task status transition API: `transitionTaskStatus` now accepts `progress` and `message` options; deprecated `validate` and `extra` options (ignored for one release).
- Changed task failure payload structure: `failTask` now nests parameters under an `error` object (`{ error: { message, details } }`) to match updated API contracts.
- Changed task listing signatures: `listTasks` parameter order is now `(limit?, offset?, status?)` with `status` deprecated and ignored; `getTasksByEntity` removed the `status` parameter entirely.
- Added new query and serialization types: exported `FullDatasetResponse`, `QueryStreamCursors`, `SerializedEntity`, `SerializedTask`, `SerializedObject`, and tombstone types (`DeletedEntityTombstone`, etc.) for changed-since and full-dataset operations.
- Refactored build preparation script (`prepare.mjs`) to use `execFileSync` with explicit module resolution instead of shell execution, preventing path resolution issues in monorepo environments.

## [0.2.25] - 2026-03-04

- Synchronized with ATLAS monorepo at commit `a695a60`
- Updated Rollup bundler and platform-specific binaries from 4.53.2 to 4.59.0
- Added prebuilt binary support for Linux loong64 (musl) and Linux ppc64 (musl) architectures
- Refreshed package-lock.json to align with upstream dependency resolutions

## [0.2.24] - 2026-02-21

- Synchronized source with upstream ATLAS monorepo (6ac7385).
- Updated dependencies.
- Internal improvements to HTTP client and test suite.
- No user-facing API changes in this release.

## [0.2.23] - 2026-02-20

- Internal: Synchronized source code from upstream ATLAS monorepo (commit d5e77a9)
- Internal: Updated HTTP client module and test suite to match upstream changes
- Internal: Updated package dependencies and lockfile to align with upstream versions

## [0.2.21] - 2026-02-20

- Routine synchronization from upstream ATLAS monorepo (e6fa8aa)
- Updated package manifest and lockfile metadata
- No functional changes or user-facing fixes

## [0.2.19] - 2026-02-19

- Internal sync from upstream ATLAS monorepo (fc2488c).
- Updated dependencies and package lockfile.
- Updated README documentation.

## [0.2.18] - 2026-02-18

- Maintenance sync from upstream ATLAS monorepo (964e6a3).
- Updated TypeScript type definitions for components.
- Routine dependency lockfile maintenance.

All notable changes to this package will be documented in this file.

The source code is mirrored from the ATLAS monorepo into `package/`.
