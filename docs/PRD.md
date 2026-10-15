# CareBridge — PRD

**Status:** Draft for approval  
**Product:** India-wide multilingual telemedicine web app  
**Team:** HealTechNexus  
**Origin:** SIH25018 — Telemedicine access for rural healthcare in Nabha

## Summary
CareBridge helps patients across India find suitable doctors, book specific appointment slots, attend online consultations, and access prescriptions and relevant medical records. Nearby doctors are prioritized, while eligible online doctors elsewhere remain discoverable.

## Goals
- Support English and Hindi initially, with an extensible path to more Indian languages.
- Search doctors by location, consultation language, specialization, fee, and availability.
- Support doctor-specific fees and date/time slot booking.
- Provide protected LiveKit video consultations.
- Keep medical records private and accessible only to authorized users.
- Build and test the core workflow before expanding scope.

## Users
- **Patient:** discovers doctors, books appointments, pays applicable fees, joins consultations, views records.
- **Doctor:** manages profile, language, fee, availability, appointments, consultations, and prescriptions.
- **Admin:** manages accounts and verifies doctor credentials.

## MVP requirements
1. Authentication and role-based access.
2. English/Hindi interface with scalable translations.
3. Doctor profiles and verification workflow.
4. Manual location selection plus optional device location.
5. Nearby-first discovery with filters and online consultation options.
6. Doctor-specific pricing and specific date/time booking slots.
7. Appointment approval, cancellation, and status tracking.
8. Server-verified payment flow.
9. LiveKit video with authorized participants.
10. Digital prescriptions and patient consultation history.
11. Patient and doctor dashboards.
12. Validation, error handling, and automated tests for critical flows.

## Out of scope for MVP
AI diagnosis/symptom checker, IoT monitoring, full ABDM/ABHA integration, native apps, assisted-worker accounts, pharmacy delivery, advanced analytics, and languages beyond English/Hindi. Revisit these after the core workflow is stable.

## Acceptance criteria
- Users cannot access functions or records outside their permissions.
- Language choice persists and missing translations fall back safely.
- Search filters show accurate doctor information.
- Slots cannot be double-booked.
- Doctor-specific fee is recorded for the booking.
- Payment is verified server-side and retries are handled safely.
- Only eligible participants can join the correct LiveKit room.
- Authorized doctors can issue prescriptions; patients can access only their own.
- Critical happy paths and failure paths pass tests.

## Open decisions
Doctor verification process; location source/ranking; cancellation/refund rules; payment provider; LiveKit room timing/duration; prescription format and record fields; notifications; hosting, retention, backups, and production compliance.

## Milestones
1. Foundation: project setup, data model, auth, translations.
2. Discovery and booking: profiles, verification, search, slots.
3. Consultation: payments, LiveKit, prescriptions, records.
4. Quality: security review, automated tests, usability fixes.
5. Expansion: approved languages and future features.
