# CareBridge 🩺
### Connected care, from discovery to consultation — with agent-assisted verification and medicine price discovery.

CareBridge is an India-focused, multilingual telemedicine platform built to connect patients with doctors through a digital care journey: discover a practitioner, request an appointment, attend a secure video consultation, and access the resulting prescription. It also explores how web agents can help with two practical healthcare tasks: checking doctor registration details against a public registry and comparing medicine listings across online pharmacies.

> **Hackathon project / active development.** Some integrations require API credentials and database migrations, and should be tested in the target environment before a live demo. TinyFish checks are advisory and are not a substitute for professional or regulatory verification.

## ✨ What makes CareBridge different?

CareBridge is designed around more than a video-call screen. It combines role-aware healthcare workflows with two **TinyFish Agent API** workflows:

- **Doctor credential cross-check:** an agent visits the configured public medical registry and extracts information for comparison with a doctor's submitted application.
- **Prescription medicine price finder:** agents search supported public pharmacy websites for each prescribed medicine and strength, then present available product, pack, price, stock, and link information when returned by the source.

These agents run asynchronously, are tracked in the database, and are designed to fail independently from the core patient/doctor workflow.

## 🚀 Core features

### Patient experience
- Patient account and profile workflows.
- Doctor discovery designed for nearby-first search, with manual location and optional device location.
- Appointment requests and doctor-specific consultation fees / scheduled slots.
- Secure consultation entry and a doctor-controlled waiting-room admission flow.
- Digital prescriptions associated with consultations, including draft/finalized states.
- Patient prescription history and agent-assisted pharmacy price results for finalized prescriptions.
- Consultation alerts and reminders where configured.

### Doctor experience
- Doctor application and credential-document submission.
- Application review and approval workflow.
- Doctor dashboard and appointment management.
- LiveKit-powered video consultation room with patient waiting-room admission.
- Clinical notes and structured digital prescription workflow.
- Access to previous patient records where available and authorized.

### Admin experience
- Admin dashboard for doctor applications and review.
- Registry-check panel showing match, mismatch, unverified, or running states when data is available.
- Ability to re-run an advisory credential check and inspect the returned agent data.

### Security-minded architecture
- Next.js server routes validate requests and derive trusted data server-side.
- Supabase Auth, Postgres, and Row Level Security (RLS) support authentication and data access boundaries.
- LiveKit tokens are issued server-side for authorized consultation participants.
- TinyFish API credentials stay server-side; agent runs are associated with a user-visible subject and tracked in the database.

## 🐟 TinyFish integration — the special part

CareBridge integrates the **TinyFish Agent API** to perform web research tasks that would otherwise require a person to manually visit multiple websites and copy details.

### 1. Doctor credential cross-check agent

**Goal:** provide administrators with an additional signal when reviewing a doctor's application.

**Flow**
1. A doctor submits an application with a registration number.
2. CareBridge triggers a TinyFish run against the configured Indian medical registry page.
3. The run is stored in `public.agent_runs` with `kind = 'credential'`.
4. The status endpoint refreshes asynchronous runs and compares the registry name with the applicant's name.
5. The admin panel presents the available result as **Match**, **Mismatch**, **Unverified**, or **Running**, with registry details and a raw-result view.

**Important:** this is an **advisory cross-check only**. It does not automatically approve or reject doctors, and a match is not a guarantee that a credential is authentic. Registry availability, page structure, and agent extraction quality can affect the result.

### 2. Medicine price finder agent

**Goal:** help patients compare public online pharmacy listings for medicines in a finalized prescription.

Supported pharmacy configuration currently includes:
- [Tata 1mg](https://www.1mg.com)
- [PharmEasy](https://pharmeasy.in)
- [Netmeds](https://www.netmeds.com)

**Flow**
1. The patient opens a finalized prescription.
2. CareBridge loads medicine names and strengths from the saved prescription on the server (up to five medicines per run request).
3. TinyFish agents search the configured pharmacy sites for each medicine/strength.
4. Results are saved and refreshed asynchronously; the UI polls for updates.
5. Results are grouped by medicine, with in-stock listings ranked ahead of out-of-stock listings and then by price where comparable data is available.

**Efficiency and resilience**
- Reuses completed price results for up to **24 hours**.
- Reuses recent in-flight runs for up to **2 minutes**.
- Polls asynchronously and stops waiting after **90 seconds**, with best-effort cancellation.
- Isolates pharmacy failures so one unavailable site does not have to hide results from other sites.
- Shows cached-result information where available.

**Important:** displayed prices and availability are indicative snapshots from public websites. They may be stale, location-dependent, or different at checkout. CareBridge does not sell or dispense medicines, and the price finder does not recommend changing a doctor's prescription.

### TinyFish implementation map

| Area | Location |
|---|---|
| Agent API helper, result parsing, status utilities | `src/lib/agents/tinyfish.js` |
| Supported pharmacy configuration | `src/lib/agents/pharmacies.js` |
| Start credential check | `src/app/api/agents/credential/start/route.js` |
| Check credential run status | `src/app/api/agents/credential/status/route.js` |
| Start medicine price search | `src/app/api/agents/prices/start/route.js` |
| Check medicine price status | `src/app/api/agents/prices/status/route.js` |
| Pharmacy results UI | `src/components/PharmacyPrices.js` |
| Run tracking table and RLS | `supabase/migrations/20261018_003_agent_runs_table.sql` |

## 🧱 Tech stack

- **Frontend / full-stack framework:** Next.js 14, React 18, JavaScript
- **Styling:** Tailwind CSS
- **Authentication and database:** Supabase Auth, PostgreSQL, Row Level Security
- **Real-time video:** LiveKit (React components, client SDK, server SDK)
- **Web-agent automation:** TinyFish Agent API
- **Icons:** Lucide React

## 🗺️ High-level architecture

```text
Patient / Doctor / Admin
          |
          v
   Next.js App Router
   |        |         |
   |        |         +--> TinyFish start/status API routes
   |        |                       |
   |        |                       v
   |        |                 TinyFish Agent API
   |        |                       |
   |        |                 Registry / Pharmacies
   |        |
   |        +--> LiveKit token / consultation APIs --> LiveKit rooms
   |
   +--> Supabase Auth + PostgreSQL + RLS
                    |
                    +--> Profiles, applications, appointments,
                         prescriptions, agent run records
```

## ⚙️ Run locally

### Prerequisites
- Node.js and npm
- A Supabase project
- LiveKit project credentials for video consultations
- TinyFish API key for agent-powered features

### 1. Clone and install

```bash
git clone https://github.com/mayanksuri21/CareBridge-v2.git
cd CareBridge-v2
npm install
```

### 2. Configure environment variables

Create a local `.env.local` file in the project root. Never commit this file.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000

LIVEKIT_URL=your_livekit_server_url
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

TINYFISH_API_KEY=your_tinyfish_api_key
NMC_REGISTRY_URL=https://www.nmc.org.in/information-system/indian-medical-register/
```

Use the actual values from your own provider dashboards. Keep all secret keys server-side; never prefix them with `NEXT_PUBLIC_`. The registry URL can be overridden if needed.

### 3. Set up the database

- Review the SQL files in `supabase/migrations/`.
- Apply migrations in the correct order to your own Supabase project.
- Confirm the tables, functions, and RLS policies are present before testing.
- Follow the project's security documentation and bootstrap-admin instructions where applicable.

Do not assume that every migration in the repository has already been applied to your database.

### 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Useful commands

```bash
npm run build
npm run lint
```

## 🔐 Security and responsible use

- Never commit `.env.local`, provider secrets, access tokens, or real patient data.
- Use a dedicated test project and synthetic patient data for demos.
- Enforce authorization on the server and with database RLS; hiding a UI control is not authorization.
- Treat credential-agent output as an additional review signal, not a final decision.
- Treat pharmacy prices and stock status as indicative, not guaranteed.
- Do not use the project as a substitute for medical advice, a clinician's judgment, or formal credential verification.
- Before real-world deployment, review privacy, security, clinical safety, applicable healthcare rules, and provider terms.

## 🧪 Demo checklist

For a reliable demo, prepare:
- An approved test doctor and a separate patient test account.
- A confirmed appointment inside the configured consultation time window.
- Working Supabase and LiveKit credentials.
- A finalized test prescription with a few sample medicines.
- A valid TinyFish API key and network access to the configured registry/pharmacy sites.

Agent outputs depend on external website availability and may not return for every medicine or registry query.

## 📚 Project documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN.md)
- [Security notes](docs/SECURITY.md)
- [Test plan](docs/TEST_PLAN.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Project task checklist](TASKS.md)

## 🛣️ Project status

CareBridge is an actively developed project. Features, migrations, and third-party integrations may require environment-specific setup and end-to-end testing. Please verify the current repository and your local configuration before presenting a workflow as production-ready.

## 🤝 Contributing

Issues and focused pull requests are welcome. Please avoid including secrets, private health information, or real patient records in issues and test fixtures.

## 📄 License

No open-source license is currently declared in this repository. Unless a license is added, do not assume the code is available for unrestricted reuse.
