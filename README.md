# Production Support Incident Console

Simulated enterprise incident-management web app focused on production support workflows:
- Incident intake and triage
- SLA tracking and breach visibility
- Runbook-driven mitigation logging
- RCA-gated closure
- Post-incident reporting and operational metrics

## Stack

- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL-compatible schema (defaults to SQLite for local run)
- Frontend: React + TypeScript + Vite
- Auth: JWT
- Charts: Recharts

## Architecture

- `frontend/`: React UI for dashboard, incident detail, runbooks, RCA, and metrics.
- `backend/`: FastAPI API with lifecycle workflow rules, audit events, SLA logic, and report export.
- Backend computes SLA and metrics server-side to keep workflow logic authoritative.

## ERD

```text
users
  id (PK)
  name
  username
  password
  role

services
  id (PK)
  name
  owner_team
  sla_policy (JSON)

runbooks
  id (PK)
  service_id (FK -> services.id)
  title
  steps_json (JSON)

incidents
  id (PK)
  title
  description
  severity
  status
  service_id (FK -> services.id)
  assignee_id (FK -> users.id, nullable)
  created_at
  acknowledged_at (nullable)
  resolved_at (nullable)
  closed_at (nullable)

incident_events
  id (PK)
  incident_id (FK -> incidents.id)
  type
  body
  created_by (FK -> users.id, nullable)
  created_at

rcas
  id (PK)
  incident_id (FK -> incidents.id, unique)
  root_cause
  contributing_factors
  corrective_actions
  prevention_actions
```

## Feature Coverage

- Incident dashboard with `status`, `severity`, `service`, `owner` filters
- Lifecycle transitions: `New -> Investigating -> Mitigated -> Resolved -> Closed`
- SLA deadline and breach state per severity policy
- Ticket detail page with timeline/events/comments
- Runbook linking per service with one-click step application logging
- RCA template required before closure
- Post-incident export as Markdown (`/incidents/{id}/report.md`)
- Metrics panel (`MTTA`, `MTTR`, breach rate)
- Stretch: synthetic alert generator (`/alerts/generate`)

## Local Run

### 1) Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend URL: `http://127.0.0.1:8000`

Optional PostgreSQL:
- Set `DATABASE_URL` in `backend/.env` (example in `backend/.env.example`)
- Install driver (`psycopg`) and point to your instance.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://127.0.0.1:5173`

## Demo Credentials

- `jordan / demo123`
- `avery / demo123`
- `morgan / demo123`

Seed data includes users, services, runbooks, and one active incident.

## Demo Script

1. Login as `jordan`.
2. Create a new `SEV2` incident and assign service/owner.
3. Open the incident detail page and transition to `Investigating`.
4. Apply one or more runbook steps and add timeline comments.
5. Transition to `Mitigated`, then `Resolved`.
6. Fill RCA fields and save.
7. Move to `Closed` (closure is blocked if RCA is incomplete).
8. Export report via `Export Post-Incident Report (Markdown)`.
9. Open Metrics tab and review `MTTA`, `MTTR`, and breach rate.

## API Highlights

- `POST /auth/login`
- `GET /incidents` (supports filters)
- `POST /incidents`
- `GET /incidents/{id}`
- `POST /incidents/{id}/status`
- `POST /incidents/{id}/comments`
- `POST /incidents/{id}/apply-runbook-step`
- `PUT /incidents/{id}/rca`
- `GET /incidents/{id}/report.md`
- `GET /metrics`
- `POST /alerts/generate`
