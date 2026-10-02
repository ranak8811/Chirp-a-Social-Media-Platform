import type { ServerCallContext } from "@protobuf-ts/runtime-rpc";
import { mapToAppError } from "../errors";
import { logger } from "./logger";
import { type TraceContext, createTraceId, runWithTrace } from "./trace";

/**
 * Wraps a service implementation to attach request-level tracing,
 * structured logging, and unified error mapping without breaking existing response contracts.
 */
export function wrapServiceWithObservability<T extends Record<string, any>>(
	serviceName: string,
	implementation: T,
): T {
	const wrapped: Record<string, any> = {};

	for (const [methodName, originalMethod] of Object.entries(implementation)) {
		if (typeof originalMethod !== "function") {
			wrapped[methodName] = originalMethod;
			continue;
		}

		wrapped[methodName] = async function (
			request: unknown,
			context?: ServerCallContext,
		) {
			const ctx = context as any;
			// Extract trace ID from incoming request headers or generate a new one
			const incomingTraceId =
				(ctx?.requestHeaders?.["x-trace-id"] as string) ||
				(ctx?.requestHeaders?.["trace-id"] as string);
			const traceId = incomingTraceId || createTraceId();

			// Echo trace ID back in response headers and trailers for client visibility
			if (ctx?.responseHeaders) {
				ctx.responseHeaders["x-trace-id"] = traceId;
			}
			if (ctx?.trailers) {
				ctx.trailers["x-trace-id"] = traceId;
			}

			const traceContext: TraceContext = {
				traceId,
				service: serviceName,
				method: methodName,
				startTime: performance.now(),
			};

			return runWithTrace(traceContext, async () => {
				logger.info(`Started RPC ${serviceName}/${methodName}`);

				try {
					const response = await originalMethod.call(
						implementation,
						request,
						context,
					);
					logger.info(`Completed RPC ${serviceName}/${methodName}`, {
						status: "OK",
					});
					return response;
				} catch (err: unknown) {
					const appError = mapToAppError(err);
					logger.error(
						`Failed RPC ${serviceName}/${methodName}: ${appError.message}`,
						{
							statusCode: appError.codeName,
							statusCodeNumber: appError.statusCode,
						},
						appError,
					);
					throw appError;
				}
			});
		};
	}

	return wrapped as T;
}
