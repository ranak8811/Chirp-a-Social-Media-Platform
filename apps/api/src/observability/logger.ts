import { getTraceContext, getTraceId } from "./trace";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	traceId: string;
	service?: string;
	method?: string;
	durationMs?: number;
	statusCode?: string | number;
	message: string;
	metadata?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
		details?: unknown;
	};
}

class StructuredLogger {
	private isProduction = process.env.NODE_ENV === "production";

	private formatLog(
		level: LogLevel,
		message: string,
		meta?: Record<string, unknown>,
		error?: Error,
	): LogEntry {
		const context = getTraceContext();
		const traceId = context?.traceId || getTraceId();

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			traceId,
			service: context?.service,
			method: context?.method,
			message,
			metadata: meta,
		};

		if (context?.startTime) {
			entry.durationMs = Math.round(performance.now() - context.startTime);
		}

		if (error) {
			entry.error = {
				name: error.name,
				message: error.message,
				stack: error.stack,
				details: (error as any).details,
			};
		}

		return entry;
	}

	private write(entry: LogEntry): void {
		const serialized = JSON.stringify(entry);
		if (entry.level === "ERROR") {
			console.error(serialized);
		} else if (entry.level === "WARN") {
			console.warn(serialized);
		} else {
			console.log(serialized);
		}
	}

	public info(
		message: string,
		meta?: Record<string, unknown>,
		error?: Error,
	): void {
		this.write(this.formatLog("INFO", message, meta, error));
	}

	public warn(
		message: string,
		meta?: Record<string, unknown>,
		error?: Error,
	): void {
		this.write(this.formatLog("WARN", message, meta, error));
	}

	public error(
		message: string,
		meta?: Record<string, unknown>,
		error?: Error,
	): void {
		this.write(this.formatLog("ERROR", message, meta, error));
	}

	public debug(
		message: string,
		meta?: Record<string, unknown>,
		error?: Error,
	): void {
		if (!this.isProduction) {
			this.write(this.formatLog("DEBUG", message, meta, error));
		}
	}
}

export const logger = new StructuredLogger();
