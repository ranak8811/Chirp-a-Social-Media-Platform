import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import {
	JWT_SECRET,
	createSessionToken,
	validateSessionToken,
} from "../src/middleware/auth";
import { loginUser } from "../src/services/auth.service";
import {
	generateId,
	hashPassword,
	hashPasswordLegacy,
	isLegacyHash,
	verifyPassword,
} from "../src/services/utils";

const { users } = schema;

describe("Issue 1: Credential Storage & Trust Establishment", () => {
	describe("Vulnerability 1: Weak Password Hashing & Transparent Migration", () => {
		it("demonstrates the vulnerability of the legacy SHA-256 implementation", () => {
			const password = "SuperSecretPassword123!";
			// Legacy hash uses static salt 'salt' with single-round SHA-256
			const hash1 = hashPasswordLegacy(password);
			const hash2 = hashPasswordLegacy(password);

			// Vulnerability: Identical passwords produce identical hashes (rainbow table / cross-user matching vulnerability)
			expect(hash1).toBe(hash2);
			expect(hash1).toHaveLength(64); // raw sha256 hex
			expect(isLegacyHash(hash1)).toBe(true);
		});

		it("resolves the vulnerability with scrypt, unique salts, and memory-hardness", async () => {
			const password = "SuperSecretPassword123!";
			const hash1 = await hashPassword(password);
			const hash2 = await hashPassword(password);

			// Resolved: Salt is randomized per hash, so hashes are distinct
			expect(hash1).not.toBe(hash2);
			expect(hash1.startsWith("scrypt$16384$8$1$")).toBe(true);
			expect(isLegacyHash(hash1)).toBe(false);

			// Verifications succeed with timing-safe comparison
			expect(await verifyPassword(password, hash1)).toBe(true);
			expect(await verifyPassword(password, hash2)).toBe(true);
			expect(await verifyPassword("WrongPassword", hash1)).toBe(false);
		});

		it("proves transparent backwards-compatible migration for existing seeded users", async () => {
			const userId = generateId();
			const legacyPassword = "legacyPassword456!";
			const legacyHash = hashPasswordLegacy(legacyPassword);

			// Seed user into database with legacy SHA-256 hash
			await db.insert(users).values({
				id: userId,
				email: `legacy-${userId}@example.com`,
				username: `legacyuser_${userId}`,
				displayName: "Legacy Seeded User",
				passwordHash: legacyHash,
				role: "user",
			});

			// Verify starting database state has the legacy hash
			const userBeforeLogin = await db
				.select()
				.from(users)
				.where(eq(users.id, userId))
				.get();
			expect(userBeforeLogin?.passwordHash).toBe(legacyHash);
			expect(isLegacyHash(userBeforeLogin!.passwordHash)).toBe(true);

			// Attempt login with wrong password -> fails
			await expect(
				loginUser({
					email: `legacy-${userId}@example.com`,
					password: "incorrectPassword",
				}),
			).rejects.toThrow("Invalid email or password");

			// Login with correct legacy password -> succeeds and triggers transparent upgrade
			const loginResult = await loginUser({
				email: `legacy-${userId}@example.com`,
				password: legacyPassword,
			});

			expect(loginResult.userId).toBe(userId);
			expect(loginResult.sessionToken).toBeDefined();

			// Verify database state: hash has been upgraded to modern scrypt hash
			const userAfterLogin = await db
				.select()
				.from(users)
				.where(eq(users.id, userId))
				.get();
			expect(userAfterLogin?.passwordHash).not.toBe(legacyHash);
			expect(userAfterLogin?.passwordHash.startsWith("scrypt$16384$8$1$")).toBe(
				true,
			);
			expect(isLegacyHash(userAfterLogin!.passwordHash)).toBe(false);

			// Subsequent login works directly with upgraded scrypt hash
			const secondLoginResult = await loginUser({
				email: `legacy-${userId}@example.com`,
				password: legacyPassword,
			});
			expect(secondLoginResult.userId).toBe(userId);
		});
	});

	describe("Vulnerability 2: Client/API Trust Establishment", () => {
		it("proves tokens forged with rogue or untrusted issuer are rejected", () => {
			// Vulnerability simulated: an external party or compromised client creates a token with rogue issuer
			const forgedToken = jwt.sign(
				{
					userId: "admin-victim-id",
					username: "admin",
					role: "admin",
					iss: "rogue-external-client",
				},
				JWT_SECRET,
			);

			// Resolved: API verifies authoritative issuer 'chirp-api'
			expect(() => validateSessionToken(forgedToken)).toThrow(
				"Invalid or expired session token",
			);
		});

		it("proves tokens with malformed or missing claims are rejected", () => {
			const incompleteToken = jwt.sign(
				{
					// missing username and role
					userId: "user-123",
					iss: "chirp-api",
				},
				JWT_SECRET,
			);

			expect(() => validateSessionToken(incompleteToken)).toThrow(
				"Invalid or expired session token",
			);
		});

		it("proves authoritative tokens issued by the API validate properly", () => {
			const validToken = createSessionToken({
				userId: "user-abc",
				username: "alice",
				role: "user",
			});

			const auth = validateSessionToken(validToken);
			expect(auth.userId).toBe("user-abc");
			expect(auth.username).toBe("alice");
			expect(auth.role).toBe("user");
		});
	});
});
