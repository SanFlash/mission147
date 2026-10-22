# Mission147 — Smart 1–4–7 Study Planner

Mission147 is a privacy-first study planner that schedules revisions using the 1–4–7 method and keeps study records in a local database by default.

## Core revision schedule

By default, each topic is scheduled relative to its original study date:

- Day 0: Learn the topic
- Day 1: First revision
- Day 4: Second revision
- Day 7: Third revision

Additional intervals such as Day 14, Day 30, Day 60, and Day 90 should be configurable. Use local calendar dates for display and scheduling, and test month boundaries and leap years.

## Planned features

- Subjects, topics, subtopics, notes, tags, and priorities
- Automatically generated revision sessions
- Today’s revision queue and upcoming reminders
- Overdue recovery and manual rescheduling
- Study-session timer, completion notes, and confidence ratings
- Calendar, flashcards, self-tests, and analytics
- Browser notifications where supported, with clear permission and background-delivery limitations
- CSV/JSON export, validated restore, and local backups
- Responsive mobile and desktop UI with purposeful GSAP animation
- Keyboard accessibility and reduced-motion support

## Local-first data

The preferred architecture is React + TypeScript + Vite + Tailwind CSS for the frontend, with Flask + SQLAlchemy + SQLite for local persistence. The API should bind to `127.0.0.1` by default. Study records and notes must not be transmitted to third parties by default.

A browser-only IndexedDB version is an acceptable alternative if it provides equivalent persistent data, export/import, and scheduling behavior.

## Reminder limitations

In-app reminders can be shown while the application is running. A regular website cannot guarantee notifications when its browser or process is closed. For dependable background reminders, consider an optional packaged desktop application with a local scheduler.

## Acceptance criteria

1. A user can create a subject, topic, and subtopics with an original study date.
2. The app schedules Day 1, Day 4, and Day 7 revisions from that date by default.
3. Revisions persist after restart and duplicate sessions are prevented.
4. Completing a session updates dashboard and analytics data.
5. Missed sessions can be recovered without silently shifting the remaining schedule.
6. Data can be exported and restored safely.
7. The application is responsive, accessible, and uses real stored data rather than hardcoded metrics.
8. Automated tests cover date calculations, persistence, reminders, import/export, and key workflows.

## Status

This repository is currently being bootstrapped. The README defines the target behavior and architecture; it does not claim that the application features have already been implemented.
