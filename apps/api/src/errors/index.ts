import { status as GrpcStatus } from "@grpc/grpc-js";

/**
 * gRPC Status Code mapping enum
 */
export const StatusCode = {
	OK: GrpcStatus.OK, // 0
	CANCELLED: GrpcStatus.CANCELLED, // 1
	UNKNOWN: GrpcStatus.UNKNOWN, // 2
	INVALID_ARGUMENT: GrpcStatus.INVALID_ARGUMENT, // 3
	DEADLINE_EXCEEDED: GrpcStatus.DEADLINE_EXCEEDED, // 4
	NOT_FOUND: GrpcStatus.NOT_FOUND, // 5
	ALREADY_EXISTS: GrpcStatus.ALREADY_EXISTS, // 6
	PERMISSION_DENIED: GrpcStatus.PERMISSION_DENIED, // 7
	RESOURCE_EXHAUSTED: GrpcStatus.RESOURCE_EXHAUSTED, // 8
	FAILED_PRECONDITION: GrpcStatus.FAILED_PRECONDITION, // 9
	ABORTED: GrpcStatus.ABORTED, // 10
	OUT_OF_RANGE: GrpcStatus.OUT_OF_RANGE, // 11
	UNIMPLEMENTED: GrpcStatus.UNIMPLEMENTED, // 12
	INTERNAL: GrpcStatus.INTERNAL, // 13
	UNAVAILABLE: GrpcStatus.UNAVAILABLE, // 14
	DATA_LOSS: GrpcStatus.DATA_LOSS, // 15
	UNAUTHENTICATED: GrpcStatus.UNAUTHENTICATED, // 16
} as const;

export type StatusCodeType = (typeof StatusCode)[keyof typeof StatusCode];

/**
 * Base Application Error adhering to gRPC error taxonomy
 */
export class AppError extends Error {
	public readonly statusCode: StatusCodeType;
	public readonly codeName: string;
	public readonly details?: unknown;

	constructor(
		message: string,
		statusCode: StatusCodeType = StatusCode.INTERNAL,
		codeName = "INTERNAL",
		details?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
		this.statusCode = statusCode;
		this.codeName = codeName;
		this.details = details;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class InvalidArgumentError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, StatusCode.INVALID_ARGUMENT, "INVALID_ARGUMENT", details);
	}
}

export class UnauthenticatedError extends AppError {
	constructor(
		message = "Authentication required",
		details?: unknown,
	) {
		super(message, StatusCode.UNAUTHENTICATED, "UNAUTHENTICATED", details);
	}
}

export class PermissionDeniedError extends AppError {
	constructor(
		message = "Permission denied",
		details?: unknown,
	) {
		super(message, StatusCode.PERMISSION_DENIED, "PERMISSION_DENIED", details);
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Resource not found", details?: unknown) {
		super(message, StatusCode.NOT_FOUND, "NOT_FOUND", details);
	}
}

export class AlreadyExistsError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, StatusCode.ALREADY_EXISTS, "ALREADY_EXISTS", details);
	}
}

export class FailedPreconditionError extends AppError {
	constructor(message: string, details?: unknown) {
		super(
			message,
			StatusCode.FAILED_PRECONDITION,
			"FAILED_PRECONDITION",
			details,
		);
	}
}

export class InternalError extends AppError {
	constructor(message = "Internal server error", details?: unknown) {
		super(message, StatusCode.INTERNAL, "INTERNAL", details);
	}
}

/**
 * Maps arbitrary caught errors or domain messages into unified gRPC taxonomy
 */
export function mapToAppError(err: unknown): AppError {
	if (err instanceof AppError) {
		return err;
	}

	const message = err instanceof Error ? err.message : String(err);

	// Pattern match known domain errors
	if (
		message.includes("required") &&
		(message.includes("Authentication") || message.includes("token"))
	) {
		return new UnauthenticatedError(message);
	}
	if (
		message.includes("Invalid or expired session token") ||
		message.includes("Unauthorized")
	) {
		return new UnauthenticatedError(message);
	}
	if (
		message.includes("access required") ||
		message.includes("You can only") ||
		message.includes("Access denied") ||
		message.includes("Account banned")
	) {
		return new PermissionDeniedError(message);
	}
	if (
		message.includes("not found") ||
		message.includes("Not found") ||
		message.includes("doesn't exist")
	) {
		return new NotFoundError(message);
	}
	if (message.includes("already exists") || message.includes("already taken")) {
		return new AlreadyExistsError(message);
	}
	if (
		message.includes("expired") ||
		message.includes("nested") ||
		message.includes("characters or less") ||
		message.includes("is required")
	) {
		return new InvalidArgumentError(message);
	}

	return new InternalError(message);
}
