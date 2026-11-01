# CROSS-INSTRUCTION CONFLICT DETECTOR (CICD AI)

**Detecting Silent Drug–Diet–Lifestyle Conflicts in Multi-Specialist Patient Care Using Generative AI**

CICD AI is a clinical decision-support **research prototype**. It reads instructions written by several specialists for the same (synthetic) patient and flags combinations that may be incompatible, even when each instruction is reasonable on its own. It combines NLP extraction, a Knowledge Graph, retrieval-augmented evidence, optional generative-AI explanations, documented severity/confidence scoring, and human-in-the-loop validation.

> ⚠️ Not a diagnostic or prescribing system. It uses synthetic, fictional data only. Every finding is a *candidate* for review by a qualified clinician.

---

## Quick start

Prerequisites: Python 3.11+ and Node.js 20+.

```bash
# 1. Backend (FastAPI) — http://127.0.0.1:8000
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
uvicorn app.main:app --port 8000

# 2. Frontend (React + Vite) — http://localhost:5173
cd frontend
npm install
npm run dev
```

On first start the backend creates `backend/cicd.db` (SQLite) and seeds the following demonstration data:

- 3 demo accounts
- 7 synthetic cases, 6 of them pre-analysed
- 3 sample diet plans
- 15 synthetic evidence summaries
- 20 test sessions
- the Knowledge Graph relation set

Delete `cicd.db` to reset.

> Tip: if the project folder is synced by OneDrive or Dropbox, SQLite file locking can stall. Set `DATABASE_URL=sqlite:///C:/temp/cicd.db` (or any local path) in `backend/.env`.

### Demo accounts (local demonstration mode only)

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@cicd.demo` | `Admin#2026demo` |
| Clinician / reviewer | `clinician@cicd.demo` | `Clinician#2026demo` |
| Clinician / reviewer | `reviewer@cicd.demo` | `Reviewer#2026demo` |

The login page offers one-click fill for these accounts while `DEMO_MODE=true`.

---

## What's in the app

| Area | What it does |
|---|---|
| **Landing** | Project overview, animated pipeline hero, conflict categories, explainability, privacy, evaluation |
| **Auth** | Login and registration with Zod validation, password visibility toggle, httpOnly session cookie, clinician/admin roles |
| **Overview** | KPIs, category/severity charts, 30-day trend, recent runs, queue preview, audit feed, KG preview. All values come from the database |
| **Patients / Demo Cases** | Create, generate synthetic case, search and filter (status, specialty, severity, date), edit metadata, archive, conflict and validation history |
| **Specialist Notes** | Add, edit and remove notes, paste or upload `.txt`/`.md`, live extraction preview, inline correction or exclusion of extracted entities |
| **Conflict Analysis** | Guided workflow (case → ≥2 sources → NLP → entity review → analysis → review → report) with **live stage progress from the backend worker**, elapsed time, cancel and retry, choice of pipeline configuration |
| **Diet Plans** | Plan list and form, meal schedule, restrictions, versioning, lifecycle *Draft → Analyzed → Awaiting Review → Reviewed → Archived*, compatibility analysis, plan-vs-plan / plan-vs-medication comparison, print view |
| **Medication Review** | All medication instructions by case or by drug, with linked findings |
| **Knowledge Graph** | React Flow explorer built from stored data: zoom/pan/drag, filter by node and relation type, search, provenance panel, triggering edges, links to cases |
| **Guideline Library** | Indexed documents, retrieval search, passage viewer, evidence usage, re-index, retrieval history, admin upload with source metadata |
| **Validation Queue** | Confirm, reject (reason required), mark uncertain, request clarification, comments, reopen. History is append-only |
| **Conflict trace** | 10-step explainability trace, each step labelled *deterministic rule*, *retrieved evidence*, *LLM-generated* or *human decision* |
| **Test Sessions** | 20 stored scenarios: run one, selected, failed or all; filter; expected vs actual; CSV/JSON export |
| **Evaluation & Metrics** | Ablation study across 4 configurations, confusion matrix, per-category P/R/F1, coverage, human-validation agreement, run history, JSON export |
| **Reports** | Point-in-time case snapshots, printable, JSON export |
| **Audit Logs** | Every state-changing action. Admins see all actors; clinicians see their own |
| **Settings** | Editable scoring policy (admin), LLM provider status, privacy controls, user and role management |

---

## Architecture

```
frontend/  React 19 · Vite · TypeScript · Tailwind CSS 4 · Motion · Recharts · React Flow · RHF + Zod
   └─ /api proxy ──► backend/  FastAPI · Pydantic · SQLAlchemy 2 · SQLite (→ PostgreSQL)
                       app/api/        routers (auth, cases, analysis, knowledge, diet, testing, misc)
                       app/services/   extraction · deid · kg (NetworkX) · retrieval (vector store)
                                       detection · scoring · llm (adapter) · pipeline · test_runner
                       app/seed/       synthetic corpus · 20 scenarios · demo cases
```

### Pipeline

1. **De-identification**: emails, phones, IDs, dates and names are regex-scrubbed before storage (`services/deid.py`).
2. **NLP extraction**: lexicon-driven clause parser for medications, foods/nutrients and lifestyle factors, with direction (take, increase, restrict, avoid, stop, keep consistent), dose, frequency, timing, context, source span and confidence. **Missing values stay `None` and are shown as "Not specified".**
3. **Knowledge Graph**: entity → class → parent class relations (e.g. `spinach → vitamin_k_rich → vitamin_k_nutrient`) are stored in the database and loaded into NetworkX. Rules are expressed on classes.
4. **RAG**: a local TF-IDF vector index over guideline chunks, behind a `VectorStore` protocol so a dense-embedding store can replace it. A passage counts as *supporting* only if it mentions both sides of the relation.
5. **Detection** (`services/detection.py`): curated interaction rules, opposite-direction checks on the same nutrient or activity axis, timing-sensitive checks, and duplicate/contradictory medication checks.
6. **Generative layer (optional)**: an Anthropic adapter using the official SDK with Pydantic-validated structured output. It writes explanations and may suggest extra candidates, which are always stored as *Uncertain*. **It never sets severity.**
7. **Human review**, then **report**.

### Severity policy (documented in `services/scoring.py`, editable in Settings)

| Step | Rule |
|---|---|
| S1 | Start from the matched rule's base severity, or an admin override |
| S2 | Timing-sensitive rule with unspecified timing → *Uncertain* |
| S3 | Hedged or low-confidence instruction → capped at *Moderate* |
| S4 | High/Critical without a supporting retrieved passage → *Uncertain / Insufficient Evidence* |
| S5 | LLM-only candidates → always *Uncertain* |

**Confidence** is computed separately: 0.4 × min(extraction confidence) + 0.35 × rule-match strength + 0.25 × normalised evidence score. It describes how certain the system is about the *pattern match*, not clinical correctness.

### Test and evaluation policy (`services/test_runner.py`)

- **Pass**: categories, outcome, evidence requirement and severity band all match.
- **Needs review**: categories and outcome match, but evidence or severity does not.
- **Fail**: anything else.

Metrics are computed per category per session, with P = TP/(TP+FP), R = TP/(TP+FN) and F1 = 2PR/(P+R). They are `null` (shown as "Undefined") when the denominator is zero.

**Latest local results** (`Run ablation study`, 20 sessions):

| Configuration | Precision | Recall | F1 | Pass / Fail / Needs review |
|---|---|---|---|---|
| Single-document baseline | Undefined | 0.0% | Undefined | 3 / 17 / 0 |
| Cross-document without KG | 100% | 75.0% | 85.7% | 13 / 5 / 2 |
| Cross-document without RAG | 100% | 95.0% | 97.4% | 5 / 6 / 9 |
| Full pipeline | 100% | 95.0% | 97.4% | 19 / 1 / 0 |

How to read these numbers: the scenarios were written together with the demonstration rule set, so they measure whether the pipeline behaves as specified, not clinical accuracy. TS-20 (St John's wort, which is outside the lexicon) is a deliberate, documented failure.

---

## Configuration

`backend/.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite by default. For PostgreSQL: `pip install "psycopg[binary]"` and set `postgresql+psycopg://user:pass@host/db`. Models use portable JSON columns |
| `JWT_SECRET` | **Required outside development**; the app refuses to start without it when `ENVIRONMENT≠development` |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `DEMO_MODE` | Seeds demo data and shows demo accounts |
| `LLM_PROVIDER` / `ANTHROPIC_API_KEY` / `LLM_MODEL` | `none` (default) or `anthropic`. Default model `claude-opus-5-5`; requests enable server-side refusal fallback |

---

## Deploy (Render)

The repo ships a `Dockerfile` (builds the frontend, then serves it from FastAPI) and a `render.yaml` Blueprint.

1. On [render.com](https://render.com), sign in with GitHub → **New → Blueprint** → select this repo → **Apply**.
2. Render generates `JWT_SECRET` and sets production env vars; the site is served at `https://<service>.onrender.com`.

On the free plan the instance sleeps when idle (first request takes ~1 min) and the SQLite database is re-seeded on each deploy/restart.

---

## Tests

```bash
cd backend && .venv\Scripts\python -m pytest -q     # 20 tests: extraction, de-id, metrics, auth, workflow, review history, tests, admin
cd frontend && npm test                              # Vitest + RTL: formatting, schemas, trace, review panel
cd frontend && npx playwright install chromium && npm run e2e   # 6 journeys (desktop + mobile); starts both servers if needed
```

---

## Security and privacy: what is and isn't implemented

**Implemented and tested:**
- salted scrypt password hashes
- httpOnly SameSite session cookie
- CSRF header requirement on writes
- login throttling (in-memory)
- role checks
- append-only review history
- audit log
- restricted CORS
- input validation
- regex de-identification
- upload type and size limits

**Not implemented:**
- MFA
- persistent lockout
- key rotation
- encryption at rest
- certified de-identification
- formal HIPAA/DPDP compliance

**Do not use with real patient data.**

## Known limitations

- The lexicon and rule set are small and hand-curated for demonstration. Severity values need clinical verification.
- The evidence corpus is **synthetic** (clearly labelled). Add licensed guideline text through the Guideline Library (admin) for real retrieval.
- TF-IDF retrieval is lexical. Swap in a dense embedding store for semantic recall.
- Rejected findings are stored for evaluation. The system does **not** learn from them automatically.
