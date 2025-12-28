# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## Adding a changeset

Run `pnpm changeset` to create a new changeset describing your changes.

## Releasing

1. Run `pnpm changeset version` to update versions and changelogs
2. Run `pnpm release` to build and publish to npm
