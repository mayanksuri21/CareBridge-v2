# CareBridge — Test Plan

## Strategy
Test business rules at unit level, database/API behavior at integration level, and complete user journeys end-to-end. Test failures and authorization boundaries, not only the happy path.

## Critical test areas
- Authentication, sessions, roles, and unauthorized access.
- English/Hindi selection, persistence, and missing-translation fallback.
- Doctor filters, verification status, location permissions, and ranking.
- Availability revalidation and concurrent slot-booking attempts.
- Fee snapshots and invalid client-submitted prices.
- Payment success, failure, cancellation, duplicate callbacks, and retries.
- LiveKit token authorization and wrong-appointment access denial.
- Prescription creation permissions and patient record privacy.
- Dashboard status/count consistency.
- Responsive layouts, keyboard access, and connection failures.

## Test levels
- **Unit:** validation, state transitions, ranking helpers, fee rules.
- **Integration:** API + database constraints, authorization, payment verification, LiveKit token endpoint.
- **End-to-end:** patient books → doctor approves → payment verified → participants join → prescription issued.
- **Security:** direct URL/API access, role tampering, ID guessing, secret exposure, replay/retry cases.
- **Manual:** mobile browser usability, language rendering, permission denial, poor connection behavior.

## Release gate
Do not mark a phase complete until its acceptance criteria pass, critical failures are fixed, and tests are repeatable. Set numeric performance targets after the hosting/test environment is selected.
