import type { GrpcSessionPayload } from "@chirp/shared-types";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.GRPC_JWT_SECRET || "chirp-grpc-jwt-secret-key-at-least-32-chars";
const JWT_ISSUER = "chirp-api";

export interface AuthContext {
	userId: string;
	username: string;
	role: "user" | "admin" | "moderator";
}

/**
 * Validates a session token and returns the auth context
 */
export function validateSessionToken(token: string): AuthContext {
	try {
		const decoded = jwt.verify(token, JWT_SECRET) as GrpcSessionPayload & { iss?: string };

		// Verify that token has required claims and correct issuer if provided
		if (decoded.iss && decoded.iss !== JWT_ISSUER) {
			throw new Error("Invalid session token issuer");
		}

		if (!decoded.userId || !decoded.username || !decoded.role) {
			throw new Error("Invalid session token claims");
		}

		return {
			userId: decoded.userId,
			username: decoded.username,
			role: decoded.role,
		};
	} catch (error) {
		throw new Error("Invalid or expired session token");
	}
}

/**
 * Creates an authoritative session token from auth context
 */
export function createSessionToken(
	context: AuthContext,
	expiresInSeconds: number = 7 * 24 * 60 * 60,
): string {
	return jwt.sign(
		{
			userId: context.userId,
			username: context.username,
			role: context.role,
		},
		JWT_SECRET,
		{ expiresIn: expiresInSeconds, issuer: JWT_ISSUER, subject: context.userId },
	);
}

/**
 * Requires authentication - throws if token is invalid
 */
export function requireAuth(token: string | undefined): AuthContext {
	if (!token) {
		throw new Error("Authentication required");
	}
	return validateSessionToken(token);
}

/**
 * Requires admin or moderator role
 */
export function requireAdmin(context: AuthContext): void {
	if (context.role !== "admin" && context.role !== "moderator") {
		throw new Error("Admin access required");
	}
}

/**
 * Requires admin role specifically
 */
export function requireSuperAdmin(context: AuthContext): void {
	if (context.role !== "admin") {
		throw new Error("Super admin access required");
	}
}

export { JWT_SECRET };
