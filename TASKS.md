# CareBridge — Tasks

## Phase 0: Requirements and documentation
- [ ] Review and approve `docs/PRD.md`.
- [ ] Confirm open product decisions that affect architecture.
- [ ] Draft and review `docs/ARCHITECTURE.md`.
- [ ] Draft and review `docs/DESIGN.md`.
- [ ] Finalize `docs/SECURITY.md` and `docs/TEST_PLAN.md`.
- [ ] Record accepted decisions in `docs/DECISIONS.md`.

## Phase 1: Foundation
- [x] Initialize project with the approved JavaScript stack (Next.js 14 App Router, Tailwind CSS).
- [x] Add environment validation and `.env.example`.
- [x] Add English/Hindi translation infrastructure with dynamic language switcher.
- [x] Public responsive landing page implemented with CareBridge design system.

## Phase 2: Authentication, Doctor Onboarding & Role Security (Completed)
- [x] Set up Supabase SSR authentication for Client and Server components.
- [x] Version-controlled database schema migration with strict RLS and storage policies (`supabase/migrations/20261014_001_phase02_auth_roles.sql`).
- [x] Distinct authentication routes: `/patient/signup`, `/patient/login`, `/doctor/apply`, `/doctor/login`, `/doctor/application-status`, `/admin/login`.
- [x] Doctor onboarding credential collection with NMC registration and private document uploads (`doctor-credentials`).
- [x] Minimum functional admin verification dashboard (`/admin/dashboard`) with approve/reject/request-changes workflow.
- [x] Server-enforced role separation (`profiles`, `doctor_applications`, and `administrators` table).
- [x] Protected portal shells: `/patient/dashboard`, `/doctor/dashboard`, `/admin/dashboard`.
- [ ] Location and language-aware search (Phase 02 discovery continuation).
- [ ] Doctor-specific fee snapshot and availability slot booking (Phase 02 booking continuation).

## Phase 3: Consultation
- [ ] Payment integration and server-side verification.
- [ ] LiveKit room/token authorization.
- [ ] Prescription creation and patient retrieval.
- [ ] Consultation history and record permissions.

## Phase 4: Admin Verification, Portal Separation & Quality (Completed)
- [x] Separate patient, doctor, and admin authentication flows; fix callback redirection.
- [x] Unverified/pending/rejected doctor applicant access restriction with explicit status gate and sign-out action.
- [x] Comprehensive Admin portal (`/admin/dashboard`) with tabs for 'Doctor Verification Requests' and 'All Registered Users'.
- [x] Short-lived signed URL generation (5 minutes) for secure admin document inspection.
- [x] Admin approval/rejection audit trail (review notes required on rejection, reviewer UUID, timestamp).
- [x] Structured Doctor dashboard (`/doctor/dashboard`) with sidebar navigation (8 tabs) and honest empty states for future phase schemas.
- [x] Session-aware, role-distinguishing public Navbar.
- [x] Migration `20261014_003_phase04_admin_verification.sql` for RLS, signed URL storage permissions, and admin authority.
- [x] Automated unit and RBAC tests (`docs/test_phase04_rbac.js`).

**Rule:** Do not start a phase while critical acceptance criteria from the previous phase remain failing.
