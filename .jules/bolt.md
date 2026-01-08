# BOLT'S JOURNAL

## 2026-01-06 - SQLite Sorting & Composite Indexes
**Learning:** SQLite query optimizer relies heavily on composite indexes for ORDER BY clauses. Sorting by a column not covered by the index used for filtering causes a "USE TEMP B-TREE FOR ORDER BY" operation, which is O(N log N) on the result set.
**Action:** When querying with `WHERE field = X ORDER BY date DESC`, ALWAYS add a composite index `(field, date DESC)` to enable O(1) retrieval order.
