"""Mission147 local-first JSON API.

Run from the repository root with: python -m backend.app
The development server binds to loopback only by default.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import date
from flask import Flask, jsonify, request
from flask_cors import CORS

from backend.database import connect, init_db
from backend.scheduler import DEFAULT_OFFSETS, build_schedule, normalize_offsets, parse_date


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(JSON_SORT_KEYS=False)
    allowed_origins = [origin.strip() for origin in os.environ.get(
        "MISSION147_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()]
    # Allow the configured origins plus this project's Vercel production/preview URLs.
    # A browser reports a CORS rejection as a generic fetch TypeError, which can look
    # like an API outage on the first visit.
    vercel_project_origin = r"https://mission147(?:-[a-z0-9-]+)?\\.vercel\\.app"
    CORS(app, resources={r"/api/*": {"origins": [*allowed_origins, vercel_project_origin]}})
    if test_config:
        app.config.update(test_config)
    db_path = app.config.get("DATABASE_PATH")
    init_db(db_path)

    def db():
        return connect(db_path)

    def error(message: str, status: int = 400):
        return jsonify({"error": message}), status

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "app": "Mission147", "schema_version": 1})

    @app.get("/api/subjects")
    def list_subjects():
        with db() as connection:
            rows = connection.execute(
                "SELECT * FROM subjects WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE"
            ).fetchall()
        return jsonify([dict(row) for row in rows])

    @app.post("/api/subjects")
    def create_subject():
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        if not name:
            return error("Subject name is required")
        if len(name) > 120:
            return error("Subject name must be 120 characters or fewer")
        with db() as connection:
            cursor = connection.execute(
                "INSERT INTO subjects(name, description, category, color) VALUES (?, ?, ?, ?)",
                (name, str(payload.get("description", ""))[:2000], str(payload.get("category", ""))[:100], str(payload.get("color", "#7667F5"))[:20]),
            )
            row = connection.execute("SELECT * FROM subjects WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return jsonify(dict(row)), 201

    @app.get("/api/topics")
    def list_topics():
        with db() as connection:
            rows = connection.execute(
                "SELECT t.*, s.name AS subject_name FROM topics t JOIN subjects s ON s.id=t.subject_id "
                "WHERE t.archived_at IS NULL ORDER BY t.original_study_date DESC, t.id DESC"
            ).fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item["tags"] = json.loads(item.pop("tags_json"))
                item["revision_offsets"] = json.loads(item.pop("revision_offsets_json"))
                item["subtopics"] = [dict(sub) for sub in connection.execute(
                    "SELECT id, title, description, notes, sort_order, completed_at FROM subtopics WHERE topic_id=? ORDER BY sort_order, id",
                    (item["id"],),
                ).fetchall()]
                item["revisions"] = [dict(revision) for revision in connection.execute(
                    "SELECT * FROM revision_sessions WHERE topic_id=? ORDER BY scheduled_date, stage", (item["id"],)
                ).fetchall()]
                result.append(item)
        return jsonify(result)

    @app.post("/api/topics")
    def create_topic():
        payload = request.get_json(silent=True) or {}
        title = str(payload.get("title", "")).strip()
        if not title:
            return error("Topic title is required")
        if len(title) > 240:
            return error("Topic title must be 240 characters or fewer")
        try:
            study_date = parse_date(payload.get("original_study_date", ""))
            subject_id = int(payload.get("subject_id"))
            offsets = normalize_offsets(payload.get("revision_offsets", DEFAULT_OFFSETS))
            difficulty = int(payload.get("difficulty", 3))
            estimated = int(payload.get("estimated_minutes", 30))
        except (ValueError, TypeError):
            return error("Provide a valid subject_id, YYYY-MM-DD study date, revision intervals, difficulty, and duration")
        if not 1 <= difficulty <= 5:
            return error("Difficulty must be between 1 and 5")
        if not 1 <= estimated <= 1440:
            return error("Estimated minutes must be between 1 and 1440")
        priority = str(payload.get("priority", "medium")).lower()
        if priority not in {"low", "medium", "high"}:
            return error("Priority must be low, medium, or high")
        subtopics = payload.get("subtopics", [])
        if not isinstance(subtopics, list) or any(not isinstance(item, str) or not item.strip() for item in subtopics):
            return error("Subtopics must be a list of non-empty strings")
        tags = payload.get("tags", [])
        if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            return error("Tags must be a list of strings")
        schedule = build_schedule(study_date, offsets)
        try:
            with db() as connection:
                subject = connection.execute("SELECT id FROM subjects WHERE id=? AND archived_at IS NULL", (subject_id,)).fetchone()
                if subject is None:
                    return error("Subject not found", 404)
                cursor = connection.execute(
                    "INSERT INTO topics(subject_id,title,description,original_study_date,priority,difficulty,estimated_minutes,tags_json,notes,revision_offsets_json) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (subject_id, title, str(payload.get("description", ""))[:5000], study_date.isoformat(), priority, difficulty, estimated,
                     json.dumps([tag.strip()[:60] for tag in tags if tag.strip()][:50]), str(payload.get("notes", ""))[:20000], json.dumps(offsets)),
                )
                topic_id = cursor.lastrowid
                for index, item in enumerate(subtopics):
                    connection.execute("INSERT INTO subtopics(topic_id,title,sort_order) VALUES(?,?,?)", (topic_id, item.strip()[:240], index))
                for session in schedule:
                    connection.execute(
                        "INSERT INTO revision_sessions(topic_id,stage,offset_days,scheduled_date,status) VALUES(?,?,?,?,?)",
                        (topic_id, session["stage"], session["offset_days"], session["scheduled_date"], "scheduled"),
                    )
                topic = connection.execute("SELECT * FROM topics WHERE id=?", (topic_id,)).fetchone()
        except sqlite3.IntegrityError as exc:
            return error(f"Could not save topic: {exc}", 409)
        result = dict(topic)
        result["tags"] = json.loads(result.pop("tags_json"))
        result["revision_offsets"] = json.loads(result.pop("revision_offsets_json"))
        result["generated_revisions"] = schedule
        return jsonify(result), 201

    @app.patch("/api/revisions/<int:revision_id>")
    def update_revision(revision_id: int):
        payload = request.get_json(silent=True) or {}
        allowed = {"scheduled_date", "scheduled_time", "status", "duration_seconds", "confidence", "notes", "skip_reason"}
        if not payload or set(payload) - allowed:
            return error("Provide one or more supported revision fields")
        updates = {}
        if "scheduled_date" in payload:
            try:
                updates["scheduled_date"] = parse_date(payload["scheduled_date"]).isoformat()
            except ValueError:
                return error("scheduled_date must use YYYY-MM-DD")
        if "scheduled_time" in payload:
            value = str(payload["scheduled_time"])
            import re
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
                return error("scheduled_time must use HH:MM (24-hour time)")
            updates["scheduled_time"] = value
        if "status" in payload:
            status = str(payload["status"])
            if status not in {"scheduled", "completed", "skipped", "snoozed"}:
                return error("Unsupported revision status")
            updates["status"] = status
            updates["completed_at"] = date.today().isoformat() if status == "completed" else None
        if "duration_seconds" in payload:
            try:
                duration = int(payload["duration_seconds"])
            except (ValueError, TypeError):
                return error("duration_seconds must be a non-negative integer")
            if duration < 0 or duration > 7 * 24 * 3600:
                return error("duration_seconds is out of range")
            updates["duration_seconds"] = duration
        if "confidence" in payload:
            try:
                confidence = int(payload["confidence"])
            except (ValueError, TypeError):
                return error("confidence must be an integer from 1 to 5")
            if not 1 <= confidence <= 5:
                return error("confidence must be an integer from 1 to 5")
            updates["confidence"] = confidence
        for key in ("notes", "skip_reason"):
            if key in payload:
                updates[key] = str(payload[key])[:10000]
        if not updates:
            return error("No valid fields provided")
        updates["updated_at"] = date.today().isoformat()
        assignments = ", ".join(f"{key} = ?" for key in updates)
        try:
            with db() as connection:
                cursor = connection.execute(f"UPDATE revision_sessions SET {assignments} WHERE id = ?", (*updates.values(), revision_id))
                if cursor.rowcount == 0:
                    return error("Revision session not found", 404)
                row = connection.execute("SELECT * FROM revision_sessions WHERE id=?", (revision_id,)).fetchone()
        except sqlite3.IntegrityError as exc:
            return error(f"Invalid revision update: {exc}", 400)
        return jsonify(dict(row))

    @app.get("/api/revisions")
    def list_revisions():
        target_date = request.args.get("date", date.today().isoformat())
        try:
            target_date = parse_date(target_date).isoformat()
        except ValueError:
            return error("date must use YYYY-MM-DD")
        status = request.args.get("status")
        with db() as connection:
            query = (
                "SELECT r.*, t.title AS topic_title, t.subject_id, s.name AS subject_name, t.estimated_minutes "
                "FROM revision_sessions r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id "
                "WHERE t.archived_at IS NULL AND r.scheduled_date <= ? AND r.status IN ('scheduled','snoozed')"
            )
            params: list[object] = [target_date]
            if status == "upcoming":
                query = query.replace("r.scheduled_date <= ?", "r.scheduled_date >= ?")
            query += " ORDER BY r.scheduled_date, r.scheduled_time, t.title"
            rows = connection.execute(query, params).fetchall()
        return jsonify([dict(row) for row in rows])

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
