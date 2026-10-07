# Phase 2 — Identity & Access: Technical Decisions

This document records the architectural decisions made during Phase 2 (Identity & Access) and the rationale behind each one.

---

## 1. Authentication Strategy

### Decision
Stateless JWT (JSON Web Tokens) for authentication (`access_token`) coupled with stateful Refresh Tokens in the database.
- **JWT Signature:** EdDSA (Ed25519) asymmetric keys instead of symmetric HMAC.

### Rationale
- **EdDSA:** Much more secure and faster to verify than RSA or ECDSA. Allows the worker or other internal services to verify tokens using only the public key, without needing the private key.
- **Stateless Access Token:** Eliminates DB lookups for every request.
- **Stateful Refresh Token:** Allows immediate revocation of sessions, rotating tokens securely.

## 2. Password Hashing

### Decision
Argon2id for password hashing.

### Rationale
- Memory-hard and CPU-hard hashing algorithm, resilient to GPU cracking and side-channel attacks. It's the current industry standard recommended by OWASP.

## 3. Security Hardening

### Decision
- **Timing Attack Protection:** The `LoginUseCase` computes a dummy Argon2 hash if the user's email is not found in the database.
- **Refresh Token Rotation:** Refresh tokens are rotated atomically inside a Prisma transaction (old token marked revoked, new token created).
- **HttpOnly Cookies:** Refresh tokens are delivered via `HttpOnly` cookies to prevent XSS attacks.

### Rationale
- Prevents user enumeration attacks (attackers cannot guess if an email exists by measuring response times).
- Thwarts token theft. If an attacker uses a stolen refresh token, the system detects reuse of a revoked token and can invalidate the entire session chain.
