# CareBridge

India-wide multilingual telemedicine web platform.

## Product direction
- JavaScript-first implementation.
- English and Hindi initially.
- Manual location and optional device location.
- Nearby-first doctor discovery, with eligible online consultations elsewhere.
- Doctor-specific fees and scheduled appointment slots.
- LiveKit video consultations.
- Digital prescriptions and protected patient records.

## Project status
- **Phase 00 & Phase 01 Completed:** Clean Next.js JavaScript application with Tailwind CSS, bilingual (English & Hindi) translation system, and complete responsive landing page with design tokens (#087F69 emerald, #2476D2 healthcare blue).
- Backend, authentication, and database features are scheduled for Phase 02/03.

## Documentation
- `docs/PRD.md` — product scope and acceptance criteria.
- `docs/ARCHITECTURE.md` — modules, data model, APIs, integrations.
- `docs/DESIGN.md` — UX and design system.
- `docs/SECURITY.md` — privacy and security rules.
- `docs/TEST_PLAN.md` — test strategy.
- `docs/DECISIONS.md` — accepted and pending decisions.
- `docs/MEMORY.md` — persistent project context.
- `TASKS.md` — phase checklist.

## Development Setup

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Run lint checks
npm run lint

# Production build
npm run build
```

Never commit real `.env` files or secrets.
