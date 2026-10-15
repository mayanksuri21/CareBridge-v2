# CareBridge — Security

## Core rules
- Enforce authorization on the server for every sensitive operation.
- Patients access only their own records; doctors access only records permitted by their consultation relationship.
- Verify doctor credentials before marking a profile verified.
- Never trust client-supplied role, fee, payment result, appointment state, or LiveKit participant identity.
- Keep secrets in environment variables; never expose server keys to browser code or commit real credentials.
- Validate inputs and return safe errors without leaking internal details.
- Use secure transport in deployment and protect sessions/cookies.
- Minimize sensitive data in logs and analytics.
- Restrict LiveKit token issuance to eligible appointment participants.
- Verify payment using trusted server-side mechanisms and process repeated callbacks idempotently.

## Phase 04: Admin Verification & Portal Access Rules
- **Role Authority:** Roles are strictly derived from database records (`profiles.role`, `doctor_applications.status`, and the isolated `administrators` table). Client-provided roles, user metadata, form inputs, or query parameters are never trusted.
- **Doctor Verification Gate:** Submitting an application creates a pending record (`status = 'pending'`). It does NOT grant doctor privileges. Unverified, pending, or rejected applicants attempting to access `/doctor/dashboard` receive an access-restricted boundary with Sign Out as the primary action.
- **Admin Verification Actions:** Approvals and rejections are recorded with `reviewed_by` (admin UUID) and `reviewed_at`. Rejection mandates a reviewer explanation note.
- **Document Protection:** Doctor credential certificates are stored in the private `doctor-credentials` bucket. Admins inspect documents exclusively via short-lived signed URLs (5 minutes duration) generated server-side under `public.is_admin()` authorization.

## Before real-patient use
Review applicable Indian telemedicine, medical-practice, privacy, and data-protection requirements with qualified stakeholders. This document is an engineering baseline, not legal advice.
