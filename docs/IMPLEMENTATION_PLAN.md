# Implementation Plan

This plan tracks the work needed to move Mission147 from specification to a verified application.

## Phase 1 — Foundation
- [ ] Define frontend/backend project structure and local launch workflow.
- [ ] Add SQLite initialization and versioned migrations.
- [ ] Implement date-only scheduling service with default offsets 1, 4, 7.
- [ ] Add unit tests for month/year boundaries, leap years, and local date semantics.

## Phase 2 — Learning data
- [ ] Subject, topic, and subtopic create/edit/archive/delete flows.
- [ ] Schedule preview before save.
- [ ] Atomic schedule generation and stable dedupe keys.
- [ ] Preserve completed sessions when a topic is edited.

## Phase 3 — Revision sessions
- [ ] Today queue and topic detail history.
- [ ] Timer with pause/resume and explicit completion.
- [ ] Confidence, notes, partial completion, skip reason, and reschedule actions.
- [ ] Overdue recovery without silently changing unrelated sessions.

## Phase 4 — Reminders and calendar
- [ ] In-app reminder center and startup reconciliation.
- [ ] Browser permission workflow, test notification, quiet hours, and snooze.
- [ ] Calendar with accessible agenda alternative and ICS export.
- [ ] Clearly document closed-browser delivery limitations.

## Phase 5 — Data safety
- [ ] JSON/CSV export and validated import preview.
- [ ] Backup/restore with pre-restore snapshot and rollback behavior.
- [ ] Schema migration test and data persistence after process restart.

## Phase 6 — Learning tools and analytics
- [ ] Notes, flashcards, self-tests, confidence history.
- [ ] Analytics powered only by persisted records.
- [ ] Daily workload capacity and streak calculations with documented definitions.

## Phase 7 — Quality and experience
- [ ] Responsive mobile/desktop design.
- [ ] Keyboard and screen-reader review.
- [ ] GSAP context cleanup and reduced-motion support.
- [ ] pytest, Vitest/Testing Library, and Playwright workflows.
- [ ] Clean install and startup instructions.

## Release gate

Do not mark the project release-ready until core flows pass automated tests, data survives restart, backup/restore has been exercised, and notification limitations are documented accurately.