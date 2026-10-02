import {
	type ScryptOptions,
	createHash,
	randomBytes,
	scrypt as scryptCb,
	timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Generate a simple ID
 */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const scryptAsync = promisify(scryptCb) as (
	password: string | Buffer,
	salt: string | Buffer,
	keylen: number,
	options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEYLEN = 64;

/**
 * Hash password using modern memory-hard scrypt algorithm with per-user unique salt
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString("hex");
	const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEYLEN, {
		N: SCRYPT_COST,
		r: SCRYPT_BLOCK_SIZE,
		p: SCRYPT_PARALLELIZATION,
	})) as Buffer;

	return `${SCRYPT_PREFIX}$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Legacy weak SHA-256 password hash with hardcoded static salt
 */
export function hashPasswordLegacy(password: string): string {
	const hash = createHash("sha256");
	hash.update(password + "salt");
	return hash.digest("hex");
}

/**
 * Check if a stored hash is using the legacy SHA-256 format
 */
export function isLegacyHash(hashedPassword: string): boolean {
	return !hashedPassword.startsWith(`${SCRYPT_PREFIX}$`);
}

/**
 * Verify password against stored hash with backwards-compatible support
 * for legacy SHA-256 hashes and timing attack resistance.
 */
export async function verifyPassword(
	password: string,
	hashedPassword: string,
): Promise<boolean> {
	if (!hashedPassword) return false;

	try {
		if (hashedPassword.startsWith(`${SCRYPT_PREFIX}$`)) {
			const parts = hashedPassword.split("$");
			if (parts.length !== 6) return false;
			const [, costStr, blockSizeStr, parallelizationStr, salt, hashHex] = parts;
			const cost = Number.parseInt(costStr, 10);
			const blockSize = Number.parseInt(blockSizeStr, 10);
			const parallelization = Number.parseInt(parallelizationStr, 10);

			const storedKey = Buffer.from(hashHex, "hex");
			const derivedKey = (await scryptAsync(password, salt, storedKey.length, {
				N: cost,
				r: blockSize,
				p: parallelization,
			})) as Buffer;

			if (derivedKey.length !== storedKey.length) return false;
			return timingSafeEqual(derivedKey, storedKey);
		}

		// Legacy SHA-256 verification
		const legacyHash = hashPasswordLegacy(password);
		const legacyBuffer = Buffer.from(legacyHash, "hex");
		const storedBuffer = Buffer.from(hashedPassword, "hex");
		if (legacyBuffer.length !== storedBuffer.length) return false;
		return timingSafeEqual(legacyBuffer, storedBuffer);
	} catch {
		return false;
	}
}

/**
 * Convert Date to protobuf Timestamp
 */
export function toProtoTimestamp(date: Date): { seconds: bigint; nanos: number } {
	const ms = date.getTime();
	return {
		seconds: BigInt(Math.floor(ms / 1000)),
		nanos: (ms % 1000) * 1000000,
	};
}

/**
 * Convert protobuf Timestamp to Date
 */
export function fromProtoTimestamp(timestamp: { seconds: bigint; nanos: number }): Date {
	return new Date(Number(timestamp.seconds) * 1000 + timestamp.nanos / 1000000);
}
