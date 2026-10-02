# Audit & Resolution: Issue 2 — Query Performance & N+1 Prevention

## 1. Executive Summary & Root Cause Analysis

### Identified Anti-Patterns
1. **$N+1$ Query Anti-Pattern**:
   In `feed.service.ts`, `posts.service.ts`, and `bookmarks.service.ts`, the application retrieved an array of $N$ items, then mapped over each item using `Promise.all` and executed individual sub-queries for each item.
2. **Decomposed Sequential Aggregate Lookups**:
   For each individual post, the code invoked `getPostCounts()`, which fired:
   - Query 1: `SELECT count(*) FROM likes WHERE postId = ...`
   - Query 2: `SELECT count(*) FROM comments WHERE postId = ...`
   - Query 3: `SELECT * FROM likes WHERE postId = ... AND userId = ...` (if requester present)
3. **Sequential Entity Fetching in Bookmarks**:
   In `bookmarks.service.ts`, fetching $N$ bookmarked posts executed:
   - 1 query to fetch bookmark records.
   - For each bookmark: 1 query to fetch the post and join user, followed by 3 count queries ($1 + 4N$ queries).
4. **Fragmented Profile Lookups**:
   In `users.service.ts`, `getUser()` executed 4 to 5 separate scalar queries for follower count, following count, post count, and follow status.

---

## 2. Before vs. After Query Counts Profile

Exact query counts measured with an active LibSQL statement listener for standard page sizes ($N = 10$):

| Operation | Before Fix (SQL Queries) | After Fix (SQL Queries) | Query Count Reduction | Time Complexity |
| :--- | :---: | :---: | :---: | :---: |
| **Home Feed (10 posts)** | **32 queries** ($2 + 3N$) | **5 queries** | **-84.4%** | $O(N) \to O(1)$ |
| **Bookmarks Page (10 posts)** | **41 queries** ($1 + 4N$) | **5 queries** | **-87.8%** | $O(N) \to O(1)$ |
| **User Profile Page (User + 10 posts)** | **37 queries** ($5 + 2 + 3N$) | **7 queries** | **-81.1%** | $O(N) \to O(1)$ |
| **Global Posts List (20 posts)** | **61 queries** ($1 + 3N$) | **4 queries** | **-93.4%** | $O(N) \to O(1)$ |

---

## 3. Reusable Pattern Established

To permanently eliminate this anti-pattern across the codebase, we created a reusable batch hydration utility:
**`apps/api/src/services/post-counts.util.ts`**

### `enrichPostsWithCounts<T>(postsList: T[], userId?: string): Promise<(T & PostCounts)[]>`
- **Batch Likes**: `SELECT postId, count(*) as count FROM likes WHERE postId IN (...) GROUP BY postId`
- **Batch Comments**: `SELECT postId, count(*) as count FROM comments WHERE postId IN (...) GROUP BY postId`
- **Batch Viewer Likes**: `SELECT postId FROM likes WHERE userId = ... AND postId IN (...)`
- In-memory `Map` lookup binds metrics to posts in $O(N)$ CPU time with zero additional database round-trips.

### Single-Item Consistency
`getPostCounts(postId, userId)` delegates directly to `enrichPostsWithCounts([{ id: postId }], userId)` to ensure a single, consistent code path.

---

## 4. Backwards Compatibility & Verification
- Field signatures, JSON structure, and return contracts for `PostResponse`, `UserProfile`, and `BookmarksResponse` are 100% identical.
- Bookmark sorting order (`createdAt DESC`) is strictly preserved across batch resolution.
- Verified by automated regression tests in `apps/api/tests/issue2-query-performance.test.ts`.
