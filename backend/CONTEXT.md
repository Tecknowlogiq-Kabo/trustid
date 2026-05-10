# Domain Context

## Bounded Context

Internal identity verification service. Wraps the TrustID API to verify the company's own users during onboarding. Callers are internal services only.

---

## Glossary

### Verification

The core aggregate. Represents a single identity verification attempt for an Applicant.

- Maps to TrustID's `Container`
- States: `Draft` (created, not yet submitted) → `Submitted` (sent to TrustID) → `Complete`
- Outcomes (when `Complete`): `Passed` | `Failed`
- `NeedsReview` is a transient internal state within TrustID — handled by their team; a second webhook arrives when resolved
- One active Verification per Applicant at a time
- A Verification always contains exactly one Document and one Face
- On failure: the Applicant starts a new Verification; the failed one remains in TrustID for audit

### Applicant

The end-user whose identity is being verified. Identified by `applicantId` — the calling service's internal user ID.

- `applicantId` is always required; anonymous Verifications have no valid use case

### Document

The identity document uploaded as part of a Verification (e.g. passport, driving licence).

- Always has a front image; may have a back image depending on document type
- Types: `Passport`, `DrivingLicence`, `NationalId`, `BRP`, `Visa`

### Face

The Applicant's selfie, used for liveness detection.

- Always required alongside a Document — a Verification without a Face is invalid
- Contains: `IsLive` (boolean), `Confidence` (0–100)
- Maps to TrustID's `ApplicantPhoto`

### Verification Flow (primary)

The standard path: the calling app captures documents and submits them via the API.

- Endpoint: `POST /trustid/verify`
- `applicantId` and `callbackUrl` are required

### Delegated Verification

Escape hatch flow: a guest link is issued so the Applicant can complete document capture outside the app via TrustID's hosted page.

- Endpoint: `POST /trustid/session`
- Use only when in-app capture is not possible

### callbackUrl

The URL provided by the calling service where this service forwards webhook results when a Verification reaches `Complete`.

---

## TrustID Term Mapping

| Domain Term          | TrustID Term     |
|----------------------|------------------|
| Verification         | Container        |
| `applicantId`        | `reference`      |
| Document             | Document         |
| Face                 | ApplicantPhoto   |
| Delegated Verification | Guest Link     |
| `Draft`              | `Temp`           |
| `Submitted`          | `Pending`        |
| `Complete`           | `Archive`        |
