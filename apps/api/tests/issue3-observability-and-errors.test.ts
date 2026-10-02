import type { ServerCallContext } from "@protobuf-ts/runtime-rpc";
import { describe, expect, it, vi } from "vitest";
import {
	AlreadyExistsError,
	AppError,
	InvalidArgumentError,
	NotFoundError,
	PermissionDeniedError,
	StatusCode,
	UnauthenticatedError,
	mapToAppError,
} from "../src/errors";
import { wrapServiceWithObservability } from "../src/observability/interceptor";
import { logger } from "../src/observability/logger";
import {
	createTraceId,
	getTraceContext,
	getTraceId,
	runWithTrace,
} from "../src/observability/trace";

describe("Issue 3: Error Handling & Observability", () => {
	describe("Unified Error Taxonomy", () => {
		it("maps specific error classes to proper gRPC status codes", () => {
			const invalidArg = new InvalidArgumentError("Invalid argument provided");
			expect(invalidArg.statusCode).toBe(StatusCode.INVALID_ARGUMENT);
			expect(invalidArg.codeName).toBe("INVALID_ARGUMENT");

			const unauth = new UnauthenticatedError("Authentication required");
			expect(unauth.statusCode).toBe(StatusCode.UNAUTHENTICATED);
			expect(unauth.codeName).toBe("UNAUTHENTICATED");

			const permDenied = new PermissionDeniedError("Admin access required");
			expect(permDenied.statusCode).toBe(StatusCode.PERMISSION_DENIED);
			expect(permDenied.codeName).toBe("PERMISSION_DENIED");

			const notFound = new NotFoundError("Post not found");
			expect(notFound.statusCode).toBe(StatusCode.NOT_FOUND);
			expect(notFound.codeName).toBe("NOT_FOUND");

			const alreadyExists = new AlreadyExistsError("Username already taken");
			expect(alreadyExists.statusCode).toBe(StatusCode.ALREADY_EXISTS);
			expect(alreadyExists.codeName).toBe("ALREADY_EXISTS");
		});

		it("maps raw domain errors into appropriate AppError types", () => {
			expect(
				mapToAppError(new Error("Invalid or expired session token")),
			).toBeInstanceOf(UnauthenticatedError);
			expect(
				mapToAppError(new Error("You can only edit your own posts")),
			).toBeInstanceOf(PermissionDeniedError);
			expect(mapToAppError(new Error("Post not found"))).toBeInstanceOf(
				NotFoundError,
			);
			expect(
				mapToAppError(new Error("User with this email already exists")),
			).toBeInstanceOf(AlreadyExistsError);
			expect(
				mapToAppError(new Error("Post content must be 280 characters or less")),
			).toBeInstanceOf(InvalidArgumentError);
		});
	});

	describe("Request Tracing & Context Propagation", () => {
		it("propagates trace context across async execution frames via AsyncLocalStorage", async () => {
			const testTraceId = createTraceId();
			expect(testTraceId).toBeDefined();

			await runWithTrace(
				{
					traceId: testTraceId,
					service: "PostsService",
					method: "CreatePost",
					startTime: performance.now(),
				},
				async () => {
					// In inner async context
					expect(getTraceId()).toBe(testTraceId);
					expect(getTraceContext()?.service).toBe("PostsService");
					expect(getTraceContext()?.method).toBe("CreatePost");

					// Nested async promise
					await new Promise((resolve) => setTimeout(resolve, 5));
					expect(getTraceId()).toBe(testTraceId);
				},
			);
		});

		it("observability interceptor injects and returns x-trace-id in trailers and headers", async () => {
			const mockHandler = {
				testRpc: vi.fn().mockResolvedValue({ success: true }),
			};

			const wrapped = wrapServiceWithObservability(
				"TestService",
				mockHandler,
			);

			const mockContext = {
				requestHeaders: { "x-trace-id": "client-provided-trace-999" },
				responseHeaders: {},
				trailers: {},
			} as unknown as ServerCallContext;

			const response = await wrapped.testRpc({}, mockContext);

			expect(response).toEqual({ success: true });
			expect(mockContext.responseHeaders["x-trace-id"]).toBe(
				"client-provided-trace-999",
			);
			expect(mockContext.trailers["x-trace-id"]).toBe(
				"client-provided-trace-999",
			);
		});

		it("observability interceptor generates unique trace-id if omitted by client", async () => {
			const mockHandler = {
				testRpc: vi.fn().mockResolvedValue({ success: true }),
			};

			const wrapped = wrapServiceWithObservability(
				"TestService",
				mockHandler,
			);

			const mockContext = {
				requestHeaders: {},
				responseHeaders: {},
				trailers: {},
			} as unknown as ServerCallContext;

			await wrapped.testRpc({}, mockContext);

			const generatedTraceId = mockContext.responseHeaders["x-trace-id"];
			expect(generatedTraceId).toBeDefined();
			expect(typeof generatedTraceId).toBe("string");
			expect(generatedTraceId.length).toBeGreaterThan(10);
			expect(mockContext.trailers["x-trace-id"]).toBe(generatedTraceId);
		});
	});

	describe("Structured Logging", () => {
		it("outputs valid JSON logs containing traceId and metadata", () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const traceId = createTraceId();

			runWithTrace(
				{
					traceId,
					service: "AuthService",
					method: "Login",
					startTime: performance.now(),
				},
				() => {
					logger.info("Test login event", { userId: "user-123" });
				},
			);

			expect(consoleSpy).toHaveBeenCalled();
			const lastCallArg = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(lastCallArg);

			expect(parsed.level).toBe("INFO");
			expect(parsed.traceId).toBe(traceId);
			expect(parsed.service).toBe("AuthService");
			expect(parsed.method).toBe("Login");
			expect(parsed.message).toBe("Test login event");
			expect(parsed.metadata).toEqual({ userId: "user-123" });
			expect(parsed.timestamp).toBeDefined();

			consoleSpy.mockRestore();
		});
	});
});
