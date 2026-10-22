# Mission147 Product Specification

## Product promise

Mission147 helps people organize learning and revise at deliberate intervals. It is a personal learning workspace, not a claim that one revision technique guarantees retention.

## Default 1–4–7 sequence

Each topic has an original study date (`Day 0`). Default revision offsets are `[1, 4, 7]` calendar days from that original date. Additional offsets `[14, 30, 60, 90]` can be enabled. Dates must be computed as local calendar dates, not by adding 24-hour UTC durations.

For a topic learned on 2026-10-22, the defaults are 2026-10-23, 2026-10-26, and 2026-10-29.

Allow an optional alternative profile that measures intervals from the previous completed revision, and label it clearly. Changing a profile or base date must preserve completed history and rebuild only the affected future sessions in a transaction.

## User flows

### Create a learning plan
1. Create or select a subject.
2. Enter topic title, description, study date, priority, difficulty, estimated minutes, tags, and notes.
3. Add subtopics individually or in bulk.
4. Preview generated revision dates.
5. Save topic and sessions atomically.

### Complete a revision
1. Open today's queue.
2. Review the topic, subtopics, notes, and prior sessions.
3. Start, pause, or resume the timer.
4. Optionally complete flashcards or a quick self-test.
5. Mark complete, partial, skipped, or reschedule.
6. Save duration, confidence (1–5), and notes.

### Recover overdue work
Show age of overdue sessions and offer: complete now, reschedule selected sessions, or spread tasks across selected days. Never silently shift unrelated future sessions. Warn if the estimated minutes exceed the user's daily capacity.

### Backup and restore
Export structured JSON and CSV. Before restore, validate schema version, field types, row counts, and file size; preview changes; reject path traversal and executable content; create a pre-restore backup. Do not overwrite current data without explicit confirmation.

## Core screens

- Dashboard with real counts for subjects, topics, due/overdue sessions, completion, time, and streak
- Subject and topic library with search, filtering, edit/archive/delete
- Topic detail with subtopics, notes, resources, and revision history
- Add/edit topic flow with schedule preview
- Today queue and focused revision workspace
- Calendar (month/week/day) and accessible agenda list
- Upcoming reminders and notification settings
- Missed-revision recovery planner
- Flashcards and self-test review
- Analytics with 7/30/90-day and custom date filters
- Settings, export/import, backup/restore

## Suggested local data model

- `subjects`: id, name, description, category, color, created_at, updated_at, archived_at
- `topics`: id, subject_id, title, description, original_study_date, target_date, priority, difficulty, estimated_minutes, tags_json, notes, resource_urls_json, revision_profile_id, archived_at, created_at, updated_at
- `subtopics`: id, topic_id, title, description, notes, sort_order, completed_at, optional_study_date
- `revision_profiles`: id, name, offsets_json, interval_mode, is_default
- `revision_sessions`: id, topic_id, subtopic_id nullable, stage, offset_days, scheduled_date, scheduled_time, status, completed_at, duration_seconds, confidence, notes, skip_reason, created_at, updated_at
- `study_sessions`: id, topic_id, started_at, ended_at, duration_seconds, notes, status
- `reminders`: id, revision_session_id, remind_at, channel, status, snoozed_until, last_attempt_at, delivered_at, error_summary, dedupe_key
- `flashcards`: id, topic_id, subtopic_id nullable, question, answer, difficulty, created_at, updated_at
- `flashcard_reviews`: id, flashcard_id, reviewed_at, result, confidence
- `user_settings`: id, timezone, theme, default_reminder_time, quiet_hours_json, daily_capacity_minutes, preferences_json
- `notification_events`: id, reminder_id, event_type, created_at, details_json
- `import_export_history`: id, operation, filename, record_counts_json, status, created_at

Use SQLite foreign keys, indexes for scheduled dates and statuses, unique constraints that prevent duplicate stages per topic/profile, and explicit transaction boundaries. Define cascade behavior intentionally; do not blindly delete historical study records when archiving a topic.

## Scheduling and status rules

- Keep a revision's `scheduled_date` as a calendar date (`YYYY-MM-DD`) and scheduled local time separately.
- Derive due and overdue state from scheduled date and saved status; avoid persisting contradictory state.
- Completed and skipped sessions are historical records and are not regenerated.
- Generate deterministic deduplication keys for reminders.
- On startup, reconcile missed reminders and due sessions without firing a backlog flood.
- A timer reaching zero must never auto-complete a session.
- Manual rescheduling must say whether it affects one session or the remaining profile.

## Notifications

- In-app reminder center is the baseline and must work offline while the app runs.
- Browser notifications require permission and supported browser behavior.
- Do not promise closed-browser delivery from a normal web app.
- If background desktop delivery is required, package the app or provide a local scheduler/OS notification integration.
- Store attempts, failures, and delivery confirmation; never claim success without evidence.

## UX and accessibility

- Responsive sidebar on desktop and accessible drawer/navigation on mobile.
- Light/dark/system themes, legible type, strong contrast, visible focus, semantic landmarks, and labelled forms.
- Support keyboard-only operation and screen readers.
- Recharts charts need a textual summary/table alternative.
- Use GSAP sparingly for route/card entrance, modal transitions, timeline changes, and progress feedback. Scope animations, clean them up, avoid duplicate timelines, and respect `prefers-reduced-motion`.
- No animation should delay or block core actions.

## Privacy and security

- No required account or cloud service.
- No third-party analytics or transmission of study notes by default.
- Bind local API to `127.0.0.1`; do not expose SQLite directly through a remote deployment.
- Validate inputs on client and server; use parameterized queries; set upload limits; validate archive schemas and JSON types.
- Treat links as data, not executable HTML. Sanitize rendered rich text.
- Explain local-device data boundaries and the need for backups.

## Test plan

- Day offsets, custom profiles, alternate interval mode, leap year and month/year boundary behavior
- Local dates, timezone and daylight-saving cases
- CRUD, foreign keys, unique constraints, migrations, and restart persistence
- Editing dates/profiles while preserving completed history
- Reminder deduplication, quiet hours, snooze, and startup reconciliation
- Overdue recovery and workload limits
- Timer pause/resume and completion history
- Import/export schema validation and backup rollback
- Keyboard flows, mobile layouts, reduced-motion, and GSAP cleanup
- End-to-end: create topic → verify dates → receive in-app due item → complete → verify analytics

## Delivery order

1. App shell, database schema/migrations, and date calculation service
2. Topic/subtopic CRUD and schedule preview
3. Today queue, session lifecycle, and in-app reminders
4. Calendar and overdue recovery
5. Import/export and backup restore
6. Analytics, flashcards, and self-test
7. Responsive design, accessibility pass, and GSAP polish
8. Automated tests, documentation, and packaging

Do not call a feature complete until it is implemented, tested, and connected to persisted data.