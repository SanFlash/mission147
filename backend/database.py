"""SQLite persistence and schema initialization for Mission147."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "instance" / "mission147.sqlite3"
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#7667F5',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT
);
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    original_study_date TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    difficulty INTEGER NOT NULL DEFAULT 3 CHECK(difficulty BETWEEN 1 AND 5),
    estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK(estimated_minutes BETWEEN 1 AND 1440),
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    revision_offsets_json TEXT NOT NULL DEFAULT '[1,4,7]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT
);
CREATE TABLE IF NOT EXISTS subtopics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS revision_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL,
    offset_days INTEGER NOT NULL CHECK(offset_days > 0),
    scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','skipped','snoozed')),
    scheduled_time TEXT NOT NULL DEFAULT '09:00',
    completed_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
    confidence INTEGER CHECK(confidence BETWEEN 1 AND 5),
    notes TEXT NOT NULL DEFAULT '',
    skip_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(topic_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_revision_due ON revision_sessions(scheduled_date, status);
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def database_path() -> Path:
    """Allow tests or local deployments to override the database location."""
    return Path(os.environ.get("MISSION147_DB_PATH", str(DEFAULT_DB_PATH))).expanduser().resolve()


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db(db_path: str | Path | None = None) -> None:
    """Create the current schema and record its version."""
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(SCHEMA_VERSION),),
        )
