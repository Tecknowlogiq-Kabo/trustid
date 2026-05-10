# ADR 0001: Pass-Through Architecture — No Local Persistence

## Status

Accepted

## Context

The service wraps TrustID's API for internal identity verification during user onboarding. A decision was needed on whether to persist verification results locally or treat TrustID as the sole system of record.

## Decision

The service is pass-through. No database. TrustID stores all verification data. Results are retrieved on-demand via `GET /trustid/results/:containerId` or delivered asynchronously via webhook forwarded to `callbackUrl`.

## Consequences

**Benefits:**
- No database infrastructure to manage
- No sync/cache invalidation complexity
- Simpler deployment

**Trade-offs:**
- Webhook deduplication uses an in-memory `Set` — resets on restart; not reliable in multi-instance deployments
- No local audit trail
- Verification history requires querying TrustID
- If TrustID is unavailable, results cannot be retrieved

## Revisit When

- Multiple service instances are needed (in-memory dedup breaks)
- Audit/compliance requirements demand a local record
- Callers need to query verification history without hitting TrustID
