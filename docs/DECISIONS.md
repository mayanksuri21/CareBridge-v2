# CareBridge — Decision Log

Record important product and technical decisions here. Add newest decisions at the top.

## D-007 — Administrator privilege authorization
- **Status:** Accepted
- **Decision:** Administrator roles are stored in a protected, dedicated `administrators` table and enforced via RLS `public.is_admin()`, never via public sign-up or editable client metadata.
- **Reason:** Prevents privilege escalation and client-side role tampering.

## D-006 — Authentication provider and SSR architecture
- **Status:** Accepted
- **Decision:** Use Supabase SSR (`@supabase/ssr` with `@supabase/supabase-js`) with distinct routes for patient, doctor, and admin portals. Doctor documents are stored in a private `doctor-credentials` bucket.
- **Reason:** Standardizes secure cookie management across Server Components, Route Handlers, and client hooks without exposing service-role keys.

## D-001 — Product scope
- **Status:** Accepted
- **Decision:** CareBridge is intended for India-wide use, not only Nabha.
- **Reason:** Product should be expandable across regions.

## D-002 — Initial languages
- **Status:** Accepted
- **Decision:** English and Hindi at launch; architecture should support adding Indian languages later.
- **Reason:** Start with a manageable scope without hard-coding text.

## D-003 — Location and discovery
- **Status:** Accepted
- **Decision:** Manual location plus optional device location; prioritize nearby doctors while allowing eligible online consultations elsewhere.
- **Reason:** Preserve choice and avoid requiring GPS permission.

## D-004 — Video
- **Status:** Accepted
- **Decision:** Use LiveKit for video consultations.
- **Reason:** Selected product direction; token authorization and secret handling must be server-side.

## D-005 — Pricing and scheduling
- **Status:** Accepted
- **Decision:** Doctor-specific consultation fees and specific date/time slots.
- **Reason:** Patients need transparent prices and scheduled appointments.

## Pending decisions
Payment provider; database/hosting; doctor verification workflow; cancellations/refunds; LiveKit session timing; prescription format; notification channels; retention and recovery policies.
