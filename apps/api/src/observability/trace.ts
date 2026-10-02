import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface TraceContext {
	traceId: string;
	service?: string;
	method?: string;
	startTime?: number;
	userId?: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Generate a new cryptographically unique trace ID
 */
export function createTraceId(): string {
	return randomUUID();
}

/**
 * Get the current request trace ID propagated via AsyncLocalStorage,
 * or generate a new fallback trace ID if called outside an active request context.
 */
export function getTraceId(): string {
	const context = traceStorage.getStore();
	return context?.traceId || createTraceId();
}

/**
 * Get the current active TraceContext if available
 */
export function getTraceContext(): TraceContext | undefined {
	return traceStorage.getStore();
}

/**
 * Run an async function within a specific TraceContext
 */
export function runWithTrace<R>(
	context: TraceContext,
	callback: () => Promise<R> | R,
): Promise<R> | R {
	return traceStorage.run(context, callback);
}

export { traceStorage };
