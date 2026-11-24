---
"farstorm": minor
---

Fetch a relation when it is awaited instead of when its property is read. Spreading an entity, or saving a spread copy, no longer queries its relations. A relation that is first awaited after its transaction ended now rejects with `ORM-1000`, even if the property was read inside the transaction.
