# Mission147 — Smart 1–4–7 Study Planner

Mission147 is a privacy-first study planner. The initial backend foundation now includes a SQLite schema, a date-safe 1–4–7 scheduler, and JSON API endpoints for subjects, topics, subtopics, and revision sessions.

## Current implementation status

Implemented:
- Local SQLite initialization and schema version metadata
- Subject creation and listing
- Topic creation and listing, with subtopics, tags, notes, and priority/difficulty fields
- Default Day 1, Day 4, and Day 7 revision generation from the original study date
- Configurable revision offsets, including extended intervals
- Revision listing and basic status, date, confidence, duration, and notes updates
- Automated tests for default dates, month/year boundaries, leap years, input validation, and persistence after app recreation

Not implemented yet: the full frontend, calendar UI, notification delivery service, topic editing/archive flows, backup/restore, flashcards, analytics, and production packaging. These remain planned work.

## Default revision schedule

- Day 0: Initial learning
- Day 1: First revision
- Day 4: Second revision
- Day 7: Third revision

The offsets are calendar days from the original study date. For example, studying on `2026-10-22` generates `2026-10-23`, `2026-10-26`, and `2026-10-29`.

## Run locally

Requires Python 3.11+.

```bash
python -m venv .venv
```

Activate the environment:

Windows PowerShell:
```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install dependencies and start the local API:

```bash
python -m pip install -r requirements.txt
python -m backend.app
```

The API binds to `127.0.0.1:5000`. The default database is created at `instance/mission147.sqlite3`. To use a different local database path, set `MISSION147_DB_PATH` before launching. The Flask app also accepts `DATABASE_PATH` in its test configuration.

Health check: http://127.0.0.1:5000/api/health

## API quick start

Create a subject:

```bash
curl -X POST http://127.0.0.1:5000/api/subjects -H "Content-Type: application/json" -d "{\"name\":\"Biology\"}"
```

Create a topic (replace `subject_id` with the ID returned above):

```bash
curl -X POST http://127.0.0.1:5000/api/topics -H "Content-Type: application/json" -d "{\"subject_id\":1,\"title\":\"Cell Structure\",\"original_study_date\":\"2026-10-22\",\"subtopics\":[\"Nucleus\",\"Mitochondria\"]}"
```

List topics and their generated revision sessions:

```bash
curl http://127.0.0.1:5000/api/topics
```

List due and overdue revisions as of a date (defaults to today's local server date):

```bash
curl "http://127.0.0.1:5000/api/revisions?date=2026-10-26"
```

## Run tests

```bash
python -m pytest -q
```

## Local-first privacy

Study records are stored in SQLite on the local computer. The API binds to loopback by default and does not send topic data to a cloud service. Do not expose this development server to a public network as-is.

## Reminder limitations

The current backend stores scheduled revision dates; it does not yet deliver notifications. A regular website cannot guarantee notifications while its browser/process is closed. The reminder service and any desktop background scheduler are future implementation work.

## Roadmap

See [Product Specification](docs/PRODUCT_SPEC.md) and [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) for the full feature set and release gates.
