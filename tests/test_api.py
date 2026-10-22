import json
from backend.app import create_app


def test_topic_creation_generates_persisted_revisions(tmp_path):
    database = tmp_path / "test.sqlite3"
    app = create_app({"TESTING": True, "DATABASE_PATH": str(database)})
    client = app.test_client()
    subject_response = client.post("/api/subjects", json={"name": "Biology"})
    assert subject_response.status_code == 201
    subject_id = subject_response.get_json()["id"]

    response = client.post("/api/topics", json={
        "subject_id": subject_id,
        "title": "Cell Structure",
        "original_study_date": "2026-10-22",
        "subtopics": ["Nucleus", "Mitochondria"],
    })
    assert response.status_code == 201
    assert [x["scheduled_date"] for x in response.get_json()["generated_revisions"]] == [
        "2026-10-23", "2026-10-26", "2026-10-29"
    ]

    restarted = create_app({"TESTING": True, "DATABASE_PATH": str(database)})
    persisted = restarted.test_client().get("/api/topics").get_json()
    assert len(persisted) == 1
    assert persisted[0]["title"] == "Cell Structure"
    assert len(persisted[0]["subtopics"]) == 2
    assert len(persisted[0]["revisions"]) == 3


def test_invalid_topic_input_is_rejected(tmp_path):
    app = create_app({"TESTING": True, "DATABASE_PATH": str(tmp_path / "test.sqlite3")})
    response = app.test_client().post("/api/topics", json={"title": "", "original_study_date": "bad"})
    assert response.status_code == 400
