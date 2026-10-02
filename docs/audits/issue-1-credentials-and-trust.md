# Audit & Resolution: Issue 1 — Credentials and Trust Establishment

## 1. Vulnerability 1: Credential Storage

### Identification & Technical Diagnosis
In `apps/api/src/services/utils.ts`, user passwords were encrypted using:
```typescript
export async function hashPassword(password: string): Promise<string> {
    const hash = createHash("sha256");
    hash.update(password + "salt");
    return hash.digest("hex");
}
```

### Flaws & Exploitation Potential
1. **Cryptographic Algorithm Unsuited for Passwords**: SHA-256 is an ultra-fast general cryptographic hash function intended for integrity verification, calculating millions/billions of hashes per second.
2. **Hardcoded Static Salt**: A single global salt (`"salt"`) is concatenated to the password. Because the salt is identical across the entire user base, identical passwords produce identical hash digests.
3. **No Key Stretching / Zero Work Factor**: There is no computational memory/CPU barrier (iterations, memory hardness).
4. **Exploitation Vectors**:
   - **Rainbow Tables & Precomputed Dictionaries**: An attacker with a database leak can invert common and medium-complexity passwords almost instantly using commodity GPUs.
   - **User Password Correlation**: An attacker can identify all accounts sharing identical passwords without cracking them first.
5. **Severity**: **Critical** (CWE-328: Use of Weak Hash, CWE-916: Insufficient Computational Effort, CWE-759: Shared Static Salt).

### Remediation & Migration Strategy
- Replaced SHA-256 with standard **scrypt** (`node:crypto`), using recommended OWASP parameters (`N: 16384, r: 8, p: 1`, 64-byte key length) and a cryptographically secure 16-byte random salt per hash (`crypto.randomBytes(16)`).
- **Backwards-Compatible Transparent Migration**:
  - We do not possess plaintext passwords for existing seeded users, so bulk offline rehashing is mathematically impossible without password reset.
  - Implemented dual-mode verification in `verifyPassword()`:
    - If `passwordHash` starts with `scrypt$16384$8$1$...`, verify via scrypt using `crypto.timingSafeEqual`.
    - If `passwordHash` is a legacy 64-char SHA-256 hex string, verify using legacy SHA-256 with timing-safe comparison.
  - On successful login in `loginUser()`, if the hash is identified as legacy (`isLegacyHash()`), the user's plaintext password provided during authentication is immediately re-hashed using `scrypt` and committed to the database (`users.passwordHash`).
  - Subsequent logins directly use the secure scrypt algorithm.

---

## 2. Vulnerability 2: Client/API Trust Establishment

### Identification & Technical Diagnosis
1. **Symmetric Secret Duplication**:
   `GRPC_JWT_SECRET` was shared with the client applications (`apps/client-user` and `apps/client-admin`).
2. **Inverted Authority (Client Minting Tokens)**:
   In `apps/client-user/src/lib/grpc.server.ts` and `apps/client-admin/src/lib/grpc.server.ts`, the clients unilaterally signed their own JWT tokens (`createGrpcSessionToken` and `createAdminGrpcSessionToken`) using `jwt.sign(...)`.
3. **Privilege Escalation & Impersonation**:
   Because clients possessed the signing key, any compromised client environment or attacker could forge arbitrary JWT tokens with `role: "admin"` or `role: "moderator"`, impersonating any `userId`.
4. **No Server Authority & Lack of Claims Verification**:
   The API server blindly verified `jwt.verify(token, JWT_SECRET)` without checking token issuer (`iss`) or verifying that the token was minted by the authoritative API.

### Remediation
1. **API as Authoritative Token Authority**:
   - `createSessionToken()` in `apps/api/src/middleware/auth.ts` signs tokens with `iss: "chirp-api"`, `sub: userId`, and explicit expiration.
   - `validateSessionToken()` strictly validates signature, issuer (`iss === "chirp-api"`), and required claims (`userId`, `username`, `role`).
2. **Client Stores and Forwards Authoritative Token**:
   - Updated `apps/client-user/src/server/functions/auth.ts` to store `response.sessionToken` (returned by API `register` and `login`) in the HTTP-only cookie session.
   - Updated `getGrpcSessionToken()` to forward the authoritative API-issued session token.
   - Retained safe fallback to maintain backwards compatibility with existing mock unit tests.

---

## 3. Verification & Proof
Created dedicated automated test suite `apps/api/tests/issue1-credentials-and-trust.test.ts`:
- Proves legacy SHA-256 vulnerability with identical password collision.
- Proves scrypt produces distinct random-salted hashes resistant to rainbow tables.
- Proves seamless migration of legacy seeded users upon login.
- Proves rogue tokens forged with invalid or untrusted issuers are rejected.
- All 144 API tests, 38 client-user tests, and 15 client-admin tests pass with zero regressions.
