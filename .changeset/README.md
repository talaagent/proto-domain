# Changesets

Every PR that changes a published package adds a changeset: `pnpm changeset`.
The plugin and the runtime are versioned together (`fixed`), because the
generated code calls the runtime it was generated for.
