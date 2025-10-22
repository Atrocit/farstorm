# farstorm

## 1.1.0

### Minor Changes

- db8b7c7: Add pg_trgm support when using pglite driver
- 2dcd8a4: Preserve row order when fetching using findByIds()
- 110ad9f: Added warning in schema validation if one-to-one relation has no unique constraint on it
- 986174d: Add explicit way to set nullability by providing 'NULLABLE' and 'NOT NULL' instead of the hard to read true/false on the nullable column

## 1.0.0

- Released the library as it has existed internally for a while as open source
