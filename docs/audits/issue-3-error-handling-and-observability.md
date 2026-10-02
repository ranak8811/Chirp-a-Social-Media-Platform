# Audit & Resolution: Issue 3 — Error Handling & Observability

## 1. Handler Error Handling Audit & Catalogue

An exhaustive audit of all 11 gRPC service handlers revealed four inconsistent, ad-hoc error handling strategies:

| Strategy | Pattern | Handlers / Methods Utilizing | Issues / Failure Modes |
| :--- | :--- | :--- | :--- |
| **Strategy A: Envelope Error Return** | `catch (err) { return { success: false, error: err.message }; }` | `posts.createPost`, `posts.updatePost`, `posts.deletePost`, `comments.createComment`, `comments.deleteComment`, `auth.register`, `auth.login`, `admin.banUser`, `admin.unbanUser`, etc. | Masks gRPC status codes; client always receives HTTP/2 200 with gRPC status `OK (0)`, preventing transport-level circuit breaking and metric alarms. |
| **Strategy B: Silent Error Swallowing & Fallbacks** | `catch { return { bookmarked: false }; }` or `{ posts: [] }`, `{ count: 0 }` | `bookmarks.getBookmarkStatus`, `bookmarks.getBookmarkedPosts`, `follows.getFollowStatus`, `follows.getFollowerCount`, `likes.getPostLikeStatus`, `notifications.getNotifications`, `notifications.getUnreadCount` | Hides critical failures (e.g. database disconnect, syntax error, table lock) as empty data, corrupting client state silently without alerting operations. |
| **Strategy C: Generic Error Rethrow** | `catch (err) { throw new Error("Failed to get user"); }` | `auth.getCurrentUser` | Loses original error details, stack traces, and produces uninformative generic messages without gRPC status mapping. |
| **Strategy D: Completely Unhandled** | No try/catch around service logic | `admin.listUsers`, `admin.getUserDetails`, `admin.getDashboardStats`, `feed.getHomeFeed`, `posts.getPosts`, `users.getUser` | Bubbles up as generic unhandled exceptions with no correlation trace ID or structured context. |

---

## 2. Unified Error Taxonomy

We implemented a unified error taxonomy in `apps/api/src/errors/index.ts` mapping directly to standard gRPC status codes:

| Error Class | gRPC Status Code | Description & Use Case |
| :--- | :---: | :--- |
| **`InvalidArgumentError`** | `3` (`INVALID_ARGUMENT`) | Validation failures (e.g. post > 280 chars, empty content, missing fields). |
| **`NotFoundError`** | `5` (`NOT_FOUND`) | Entity lookups failing (e.g. user, post, comment not found). |
| **`AlreadyExistsError`** | `6` (`ALREADY_EXISTS`) | Unique constraint conflicts (e.g. duplicate email, duplicate username). |
| **`PermissionDeniedError`** | `7` (`PERMISSION_DENIED`) | Authorization failures (e.g. admin role required, editing another's post, banned user). |
| **`FailedPreconditionError`** | `9` (`FAILED_PRECONDITION`) | State validation conflicts (e.g. edit window > 5 min, nested replies). |
| **`InternalError`** | `13` (`INTERNAL`) | Unexpected server and database failures. |
| **`UnauthenticatedError`** | `16` (`UNAUTHENTICATED`) | Missing, expired, or invalid session token. |

`mapToAppError(err)` automatically translates raw system or domain exceptions into typed `AppError` instances.

---

## 3. Request-Level Tracing & Context Propagation

Implemented via Node.js `AsyncLocalStorage` in `apps/api/src/observability/trace.ts`:
- **Trace Context**: Stores `traceId`, `service`, `method`, and `startTime`.
- **Bidirectional Header Propagation**:
  - Automatically extracts `x-trace-id` (or `trace-id`) from incoming gRPC call metadata if supplied by the client/gateway.
  - Automatically generates an RFC 4122 v4 UUID (`crypto.randomUUID()`) when missing.
  - Injects `x-trace-id` into response headers and gRPC response trailers (`context.trailers["x-trace-id"] = traceId`) for client-side correlation.
- **Deep Service Propagation**: `getTraceId()` is callable anywhere in services and helper layers without modifying function signatures.

---

## 4. Structured JSON Logging

Implemented in `apps/api/src/observability/logger.ts`:
Every gRPC request automatically logs start and completion with latency and status code in machine-parseable JSON:
```json
{
  "timestamp": "2026-10-02T09:00:01.214Z",
  "level": "INFO",
  "traceId": "client-provided-trace-999",
  "service": "PostsService",
  "method": "CreatePost",
  "message": "Completed RPC PostsService/CreatePost",
  "durationMs": 7,
  "metadata": { "status": "OK" }
}
```
On errors, logs include full error details, `statusCode`, and stack trace with level `ERROR`.

---

## 5. Non-Breaking Response Contract Guarantee

The interceptor wrapper (`wrapServiceWithObservability`) preserves all existing protobuf and TypeScript contract shapes:
- Methods returning `{ success: boolean, error?: string }` continue to deliver their expected contract to existing clients and tests.
- Response trailers provide standardized transport-level observability.
- Verified by passing 100% of pre-existing unit tests and dedicated tests in `apps/api/tests/issue3-observability-and-errors.test.ts`.
