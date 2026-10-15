# CareBridge — Design

## Product experience
Design for patients with varied digital literacy, multilingual needs, and mobile devices. Keep primary actions obvious and avoid clutter.

## Main areas
- Public: landing page, language selection, doctor discovery, doctor profile.
- Patient: profile, appointments, payment status, consultation entry, prescriptions, history.
- Doctor: profile/availability, appointment requests, consultation entry, prescription workflow.
- Admin: user management, doctor verification, operational issues.

## UX rules
- English/Hindi at launch; all interface strings come from translation resources.
- Persist language choice and provide an English fallback for missing strings.
- Keep patient interface language separate from doctor consultation languages.
- Manual location selection must work when location permission is denied.
- Show clear loading, empty, success, error, and offline/connection states.
- Confirm important actions such as booking, cancellation, and prescription issuance.
- Display fee, time, doctor verification, consultation mode, and appointment status clearly.
- Do not rely on color alone to communicate state.

## Responsive and accessible design
- Mobile-first layouts; test desktop and supported mobile browsers.
- Readable typography, sufficient contrast, clear labels, keyboard access, and screen-reader names.
- Use large touch targets and avoid unnecessarily long forms.

## Design system
Define shared colors, typography, spacing, buttons, forms, status labels, cards, and navigation before building multiple screens. Avoid one-off styling where a shared component is suitable.
