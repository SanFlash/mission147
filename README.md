# Mission147 — Smart 1–4–7 Study Planner

Mission147 is a responsive study-planning dashboard built with React, TypeScript, Vite, GSAP, and a Flask JSON API. It schedules revision sessions from the original study date using the 1–4–7 method and supports custom revision intervals.

## Free deployment overview

You can publish the frontend for free on Vercel and run the Flask API on Render's Free web-service plan.

- **Frontend:** Vercel Hobby — `frontend/` directory, built with Vite.
- **API:** Render Free web service — Python + Flask + Gunicorn.
- **Database in this phase:** SQLite on the Render service's temporary filesystem.

**Important free-tier limitation:** Render Free services have an ephemeral filesystem and can spin down after inactivity. SQLite records can be lost when the service restarts, spins down, or redeploys. Use this setup to learn, preview the UI, and test the flow with non-important sample data only. Do not store irreplaceable study records in this free SQLite deployment. Render's free Postgres option is time-limited (currently 30 days), so it is not a durable replacement. Before relying on saved records, the next phase should migrate the API to a persistent managed database such as Supabase or another suitable PostgreSQL provider and test the migration end-to-end.

Vercel hosts the frontend, not the current SQLite API. Deploying the existing Flask + SQLite backend as a Vercel Function would not make the SQLite file persistent.

## Current implementation

- Responsive React dashboard with overview, topics, revision queue, calendar, and settings views.
- Subject and topic creation, subtopics, priority, estimated duration, and configurable revision intervals.
- SQLite schema and Flask JSON endpoints for subjects, topics, subtopics, and revision sessions.
- Revision status updates and date-safe schedule generation.
- GitHub Actions checks for backend tests and frontend build.

Notifications, topic editing/archive, backup/restore, flashcards, and advanced analytics are future phases. The current reminder feature stores revision dates; it does not send push/email notifications.

## Default revision schedule

- Day 0: Initial learning.
- Day 1: First revision.
- Day 4: Second revision.
- Day 7: Third revision.

Offsets are calendar days from the original study date. For example, studying on `2026-10-22` generates revisions on `2026-10-23`, `2026-10-26`, and `2026-10-29`.

---

# Part A — Deploy the API on Render Free

Deploy the API first. Vercel needs the API's public URL to connect the frontend to it.

### 1. Push the latest repository to GitHub

Open your repository: https://github.com/SanFlash/mission147

Make sure your latest changes are committed to the `main` branch.

### 2. Create the Render service

1. Open https://render.com/ and sign in.
2. Choose **New + → Blueprint**.
3. Connect your GitHub account if prompted.
4. Select `SanFlash/mission147`.
5. Review the settings from `render.yaml`. The blueprint uses a **Free** web-service plan and does not attach a paid disk.
6. Create/apply the Blueprint and wait for the first deployment to finish.

If you prefer to create it manually instead of using the Blueprint:

| Render setting | Value |
| --- | --- |
| Service type | Web Service |
| Repository | `SanFlash/mission147` |
| Branch | `main` |
| Runtime | Python |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4` |
| Plan | Free |

Set these environment variables in the Render service:

| Name | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.8` |
| `MISSION147_CORS_ORIGINS` | Your exact Vercel site origin after Part B, e.g. `https://mission147-example.vercel.app` |

You can temporarily set `MISSION147_CORS_ORIGINS` to `http://localhost:5173,http://127.0.0.1:5173` while testing locally. Replace it with the production Vercel origin when you deploy the frontend. If you need both local and hosted testing, separate origins with commas. Use origins only (scheme + hostname; no path and no trailing slash).

### 3. Copy and test the API URL

Render will assign a URL similar to `https://mission147-api.onrender.com`. Use the actual URL shown in your Render dashboard.

Open this in a browser:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

Expected response:

```json
{"status":"ok","app":"Mission147","schema_version":1}
```

If this endpoint does not return `status: ok`, open the service's **Logs** in Render and fix the backend error before continuing.

### 4. Understand the free backend limitations

- A free service may take around a minute to wake after it has been idle.
- SQLite lives on a temporary filesystem in this free configuration.
- Records may disappear after spin-down, restart, or redeploy. Treat this as a demo deployment only.
- Do not add a paid plan or database unless you choose to; the steps here do not require payment.

Reference: https://render.com/docs/free

---

# Part B — Deploy the frontend on Vercel Free

### 5. Import Mission147 into Vercel

1. Open https://vercel.com/ and sign in.
2. Choose **Add New → Project**.
3. Import the GitHub repository `SanFlash/mission147`. Authorize Vercel to access the repository if requested.
4. In **Configure Project**, set **Root Directory** to `frontend`. Confirm that Vercel is using the `frontend` folder, not the repository root.
5. If needed, choose **Vite** for Framework Preset.

Confirm these build settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### 6. Add the API environment variable

In Vercel's project configuration, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `VITE_API_BASE_URL` | Your Render API origin, e.g. `https://mission147-api.onrender.com` |

Use the real Render URL. Do not add `/api` to the end and do not add a trailing slash.

Choose the **Production** environment (and Preview too, if you intend to use preview deployments with this same API). Then deploy.

**Important:** Vite embeds `VITE_*` values during the build. If you change this value later, trigger a new Vercel deployment.

### 7. Copy the Vercel website origin

After deployment, Vercel gives you a URL like `https://mission147-example.vercel.app`. Open it once to confirm the page loads, then copy the exact origin.

### 8. Allow your Vercel domain in Render CORS

1. Return to Render and open the `mission147-api` service.
2. Go to **Environment**.
3. Set `MISSION147_CORS_ORIGINS` to the exact Vercel origin, for example `https://mission147-example.vercel.app`.
4. If you use a custom domain, add it as another comma-separated origin.
5. Save changes and wait for Render to restart/redeploy.
6. Reload your Vercel site.

Do not use `*` as a permanent CORS policy for a public deployment.

---

# Part C — Verify the hosted app

### 9. Run this acceptance checklist

- [ ] The Render `/api/health` endpoint returns `status: ok`.
- [ ] The Vercel website loads over HTTPS.
- [ ] The browser console has no CORS or failed-network errors.
- [ ] Create a test subject.
- [ ] Create a topic with the study date set to today.
- [ ] Confirm revision dates are generated for Day 1, Day 4, and Day 7.
- [ ] Mark a revision complete and verify the UI updates.
- [ ] Refresh the page and verify data while the service remains running.
- [ ] Check Render logs and Vercel deployment logs if something fails.

Because the free Render filesystem is temporary, a successful refresh does **not** guarantee long-term persistence. Do not use the free SQLite setup as the only copy of important records.

## Troubleshooting

**The page is blank or Vercel reports a build error**
- Confirm Root Directory is `frontend`.
- Confirm build command is `npm run build` and output directory is `dist`.
- Open the failed deployment's **Build Logs** for the first actual error.

**The dashboard says “Failed to fetch”**
- Confirm `VITE_API_BASE_URL` contains the Render service origin only.
- Confirm `https://YOUR-RENDER-SERVICE.onrender.com/api/health` works.
- Redeploy Vercel after changing `VITE_API_BASE_URL`.

**The browser reports a CORS error**
- Set `MISSION147_CORS_ORIGINS` to the exact Vercel origin in Render.
- Do not include a trailing slash or a URL path.
- Wait for the backend to restart, then reload the website.

**The first API request is slow**
- The free Render service may be waking after an idle period. Wait for the health endpoint to respond, then retry.

**Records disappeared**
- This is an expected limitation of SQLite on a free Render filesystem. Do not attempt to fix it by repeatedly redeploying. Persistent storage is the next phase.

---

# Run Mission147 locally

Requires Python 3.11+ and Node.js.

Start the API from the repository root:

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

Open http://127.0.0.1:5173. When `VITE_API_BASE_URL` is blank, Vite proxies `/api` requests to `http://127.0.0.1:5000`.

To create a production frontend bundle locally:

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

Frontend build check:

```powershell
cd frontend
npm install
npm run build
```

## Next phase — durable storage

Before using Mission147 as a real daily study tracker, migrate the current SQLite database layer to a persistent PostgreSQL provider (for example, Supabase), add environment-based connection configuration, and test schema creation, topic creation, revision updates, and data retention after redeploy. Keep database credentials in the backend host's environment variables; never put a database password in a `VITE_*` frontend variable.
