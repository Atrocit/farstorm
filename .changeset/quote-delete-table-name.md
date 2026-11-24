---
"farstorm": patch
---

Quote the table name in `deleteMany` and `deleteByIds`. Deleting an entity whose table name is a reserved word, such as `user`, no longer fails with a syntax error.
