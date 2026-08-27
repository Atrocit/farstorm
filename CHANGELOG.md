# farstorm

## 1.2.0

### Minor Changes

- 71c5be8: Add PostgreSQL row-lock modes and wait behavior to `findOne` and `findMany`.
- bf655b1: Add a per-entity `auditLogging` setting. Set it to `'DISABLED'` in `defineEntity()` to exclude that entity from audit logging. The setting defaults to `'ENABLED'`.
- 85caf91: Add read-only entity fields and make the known-column write boundary explicit.

### Patch Changes

- a743e40: Keep batch-insert audit diffs associated with the entity that produced each diff.
- bf82c81: Serialize Json field values before SQL formatting so arrays and other JSON values persist correctly.
- 4971de1: Recognize composite relation indexes during schema validation while requiring single-column indexes for one-to-one uniqueness.

## 1.1.2

### Patch Changes

- 8d087f7: Fix validateSchema not correctly dealing with 'NULLABLE' and 'NOT NULL' values

## 1.1.1

### Patch Changes

- 327b6fe: Fix InputType not correctly recognizing 'NULLABLE' as nullable status

## 1.1.0

### Minor Changes

- db8b7c7: Add pg_trgm support when using pglite driver
- 2dcd8a4: Preserve row order when fetching using findByIds()
- 110ad9f: Added warning in schema validation if one-to-one relation has no unique constraint on it
- 986174d: Add explicit way to set nullability by providing 'NULLABLE' and 'NOT NULL' instead of the hard to read true/false on the nullable column

## 1.0.0

- Released the library as it has existed internally for a while as open source
