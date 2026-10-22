# Mission147 — Smart 1–4–7 Study Planner

Mission147 is a responsive study-planning dashboard built with React, TypeScript, Vite, GSAP, and a Flask JSON API. It schedules revision sessions from the original study date using the 1–4–7 method and supports custom revision intervals.

## Deployment architecture

**Recommended hosting layout:** Vercel hosts the React frontend; Render hosts the Flask API and its persistent SQLite database. The frontend talks to the API over HTTPS.

Vercel's serverless filesystem is ephemeral, so SQLite files written by a Vercel Function are not a safe persistent database. Do not deploy the current SQLite API to Vercel and expect study records to persist. The included `render.yaml` configures a Render web service with a persistent disk for the SQLite file. The Render disk requires a paid Render service plan. A later production phase can move persistence to managed PostgreSQL if you prefer a database service instead of a mounted disk.

## Current implementation

- Responsive React dashboard with overview, topics, revision queue, calendar, and settings views
- Subject and topic creation, subtopics, priority, estimated duration, and configurable revision intervals
- SQLite schema and Flask JSON endpoints for subjects, topics, subtopics, and revision sessions
- Revision status updates and date-safe schedule generation
- GitHub Actions checks for backend tests and frontend build

Notifications, topic editing/archive, backup/restore, flashcards, and advanced analytics are future phases. The current reminder feature stores revision dates; it does not send push/email notifications.

## Default revision schedule

- Day 0: Initial learning
- Day 1: First revision
- Day 4: Second revision
- Day 7: Third revision

Offsets are calendar days from the original study date. For example, studying on `2026-10-22` generates revisions on `2026-10-23`, `2026-10-26`, and `2026-10-29`.

## Step 1 — Deploy the Flask API on Render

The API must be deployed first so the frontend has a live API origin to connect to.

1. Push the latest `main` branch to GitHub.
2. Sign in to [Render](https://render.com/) and choose **New + → Blueprint**.
3. Connect the GitHub account and select `SanFlash/mission147`.
4. Render reads the repository's `render.yaml`. Review the service before applying it.
5. The blueprint configures a Python web service named `mission147-api`, the Gunicorn start command, a health check, and a 1 GB persistent disk mounted at `/var/data`. The persistent disk requires a paid Render plan; do not remove it while using SQLite for production data.
6. Deploy the service and wait until it is live. Copy its public URL, for example `https://mission147-api.onrender.com` (use the actual URL Render assigns).
7. Open `https://YOUR-RENDER-SERVICE.onrender.com/api/health`. Expected response resembles:

   ```json
   {"status":"ok","app":"Mission147","schema_version":1}
   ```

8. Leave the Render service's `MISSION147_CORS_ORIGINS` environment variable ready to update after Vercel assigns the frontend URL. If Render requires a value at creation, use the exact expected frontend origin temporarily and update it after the first Vercel deployment.

### Render environment variables

The blueprint sets these values:

| Variable | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.8` |
| `MISSION147_DB_PATH` | `/var/data/mission147.sqlite3` |
| `MISSION147_CORS_ORIGINS` | Set this to your Vercel frontend origin(s), comma-separated |

For `MISSION147_CORS_ORIGINS`, use origins only: scheme and hostname, with no path or trailing slash. Example: `https://mission147.vercel.app`. Add your production domain and any preview domain you explicitly want to permit. Avoid `*` for a public app.

## Step 2 — Deploy the React frontend on Vercel

1. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import the GitHub repository `SanFlash/mission147`.
3. In **Configure Project**, set **Root Directory** to `frontend` and confirm the directory selection.
4. Select **Vite** as the framework preset if Vercel does not detect it automatically.
5. Confirm the build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite |
   | Root Directory | `frontend` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Install command | `npm install` |

6. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | Your Render API origin, e.g. `https://mission147-api.onrender.com` |

   Use the actual Render service URL, without a trailing slash and without `/api`.

7. Click **Deploy**. When the deployment finishes, open the assigned `*.vercel.app` URL and copy the exact origin.

Vercel's Git integration will create deployments from pushes to the connected repository. Changes in `frontend/` are built using the configured frontend root directory.

## Step 3 — Allow the Vercel frontend in the API's CORS settings

1. In Render, open the `mission147-api` service.
2. Go to **Environment** and set `MISSION147_CORS_ORIGINS` to the exact Vercel origin copied above, for example `https://mission147.vercel.app`.
3. If you use a custom domain, include that origin too, comma-separated. Do not include URL paths.
4. Save the environment variable and let Render redeploy/restart the service.
5. Reload the Vercel app. If you changed `VITE_API_BASE_URL`, trigger a new Vercel deployment because `VITE_*` variables are embedded at build time.

## Step 4 — Verify the deployment

Run through this checklist:

- [ ] `https://YOUR-RENDER-SERVICE.onrender.com/api/health` returns status `ok`.
- [ ] The Vercel page loads without a blank screen.
- [ ] The dashboard can load subjects, topics, and revisions without a CORS/network error.
- [ ] Create a test subject and a topic.
- [ ] Confirm the topic appears and its Day 1, Day 4, and Day 7 sessions are listed.
- [ ] Mark a revision complete and confirm the status updates.
- [ ] Refresh the page and confirm the test records remain present.
- [ ] Check Render logs and Vercel deployment logs if any step fails.

**Persistence check:** After creating test records, redeploy/restart the Render service and verify they still exist. The mounted disk must remain attached at `/var/data`. Do not remove or recreate the disk casually; that can delete the SQLite database.

## Troubleshooting

- **Dashboard says failed to fetch:** Check `VITE_API_BASE_URL`, make sure it is only the Render origin, and confirm the Render service is live.
- **CORS error in browser console:** Update `MISSION147_CORS_ORIGINS` with the exact frontend origin, save, and wait for the API restart.
- **Vercel build fails:** Confirm Root Directory is `frontend`, install command is `npm install`, build command is `npm run build`, and output directory is `dist`.
- **Records disappear after redeploy:** Confirm Render has a persistent disk mounted at `/var/data` and `MISSION147_DB_PATH=/var/data/mission147.sqlite3`. An ephemeral filesystem is not suitable for the live SQLite database.
- **Render service sleeps or responds slowly:** This may be a hosting-plan behavior. Check the current Render plan and service logs.

## Run locally

Requires Python 3.11+ and Node.js.

Start the Flask API from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m backend.app
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). When `VITE_API_BASE_URL` is blank, Vite proxies `/api` requests to `http://127.0.0.1:5000`.

To create the production frontend bundle locally:

```powershell
cd frontend
npm run build
```

## Run tests

From the repository root:

```powershell
python -m pip install -r requirements.txt
python -m pytest -q
```

The frontend build check runs with:

```powershell
cd frontend
npm install
npm run build
```

## Local database and privacy

Local development stores records in `instance/mission147.sqlite3`. Set `MISSION147_DB_PATH` to override the local database path. When using the hosted version, study records are sent to the API service and stored in the configured backend database; the hosted version is **not local-only**. Use only data you are comfortable storing on your chosen hosting provider and keep deployment logs free of private study content.

## Roadmap

See [Product Specification](docs/PRODUCT_SPEC.md) and [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) for the broader product plan.
