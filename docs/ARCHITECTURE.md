# CareBridge — Architecture

**Status:** Draft; finalize before implementation.

## Principles
- JavaScript-first; keep modules small and responsibilities clear.
- Separate UI, business rules, data access, and external services.
- Enforce authorization and validation on the server.
- Treat appointment and payment state transitions as explicit rules.
- Prefer reliable, testable workflows over premature complexity.

## Proposed system boundaries
- **Web UI:** patient, doctor, and admin experiences.
- **Server/API:** authentication checks, business rules, validation, and orchestration.
- **Database:** users/profiles, doctor details, availability, appointments, payments, consultations, prescriptions, and audit events.
- **LiveKit:** video rooms and participant tokens; secrets stay server-side.
- **Payment provider:** checkout and trusted payment verification.
- **Translation resources:** English/Hindi initially; additional languages added without rewriting UI logic.

## Core entities (conceptual)
- User and role/profile
- Doctor verification
- Doctor language and specialization
- Availability slot
- Appointment
- Payment transaction
- Consultation session
- Prescription
- Medical record
- Audit event

Finalize fields, relationships, constraints, indexes, and ownership policies before creating schema.

## Core flows
1. Patient searches eligible doctors and available slots.
2. Server revalidates slot and creates appointment with fee snapshot.
3. Doctor approves or declines according to appointment rules.
4. Payment is verified server-side where required.
5. Server authorizes LiveKit room access for the appointment participants.
6. Doctor issues prescription; appointment completion follows documented rules.

## Required design decisions
Confirm framework/runtime, database and hosting, auth provider, payment provider, LiveKit token flow, file storage, notifications, and deployment environments before implementation.

## Reliability rules
- Prevent conflicting slot bookings using database-backed constraints/transactions.
- Make payment callback processing idempotent.
- Never trust client-side role, price, payment-success, or appointment-state values.
- Define allowed state transitions centrally and test them.
