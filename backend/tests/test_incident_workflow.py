from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app, login_rate_limiter
from app.models import Incident, User
from app.passwords import is_password_hash
from app.seed import seed


def reset_database() -> None:
    login_rate_limiter.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/auth/login", json={"username": "jordan", "password": "demo123"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def first_service_id(client: TestClient, headers: dict[str, str]) -> int:
    response = client.get("/services", headers=headers)
    assert response.status_code == 200
    return response.json()[0]["id"]


def create_incident(client: TestClient, headers: dict[str, str], severity: str = "SEV2") -> int:
    payload = {
        "title": "Test incident",
        "description": "Synthetic test incident",
        "severity": severity,
        "service_id": first_service_id(client, headers),
        "assignee_id": None,
    }
    response = client.post("/incidents", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["id"]


def test_lifecycle_and_rca_closure_gate() -> None:
    reset_database()
    with TestClient(app) as client:
        headers = auth_headers(client)
        incident_id = create_incident(client, headers, severity="SEV2")

        for status in ["Investigating", "Mitigated", "Resolved"]:
            response = client.post(
                f"/incidents/{incident_id}/status",
                json={"status": status, "note": f"Moved to {status}"},
                headers=headers,
            )
            assert response.status_code == 200
            assert response.json()["status"] == status

        close_without_rca = client.post(
            f"/incidents/{incident_id}/status",
            json={"status": "Closed", "note": "Attempting closure"},
            headers=headers,
        )
        assert close_without_rca.status_code == 400
        assert "RCA is required" in close_without_rca.json()["detail"]

        save_rca = client.put(
            f"/incidents/{incident_id}/rca",
            json={
                "root_cause": "Connection pool exhaustion",
                "contributing_factors": "High retry fanout",
                "corrective_actions": "Increase pool and cap retries",
                "prevention_actions": "Capacity alerting + load test gate",
            },
            headers=headers,
        )
        assert save_rca.status_code == 200

        close_with_rca = client.post(
            f"/incidents/{incident_id}/status",
            json={"status": "Closed", "note": "RCA complete"},
            headers=headers,
        )
        assert close_with_rca.status_code == 200
        assert close_with_rca.json()["status"] == "Closed"
        assert close_with_rca.json()["closed_at"] is not None


def test_seeded_passwords_are_hashed_and_invalid_login_fails() -> None:
    reset_database()
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == "jordan").one()
        assert user.password != "demo123"
        assert is_password_hash(user.password)

    with TestClient(app) as client:
        response = client.post("/auth/login", json={"username": "jordan", "password": "wrong"})
        assert response.status_code == 401


def test_login_rate_limit_blocks_repeated_failures() -> None:
    reset_database()
    with TestClient(app) as client:
        for _ in range(5):
            response = client.post("/auth/login", json={"username": "jordan", "password": "wrong"})
            assert response.status_code == 401

        blocked = client.post("/auth/login", json={"username": "jordan", "password": "wrong"})
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) > 0


def test_sla_breach_and_non_breach_cases() -> None:
    reset_database()
    with TestClient(app) as client:
        headers = auth_headers(client)

        sev1_incident_id = create_incident(client, headers, severity="SEV1")
        with SessionLocal() as db:
            incident = db.query(Incident).filter(Incident.id == sev1_incident_id).first()
            assert incident is not None
            incident.created_at = datetime.utcnow() - timedelta(hours=2)
            db.commit()

        breached = client.get(f"/incidents/{sev1_incident_id}", headers=headers)
        assert breached.status_code == 200
        assert breached.json()["sla_breached"] is True

        sev4_incident_id = create_incident(client, headers, severity="SEV4")
        healthy = client.get(f"/incidents/{sev4_incident_id}", headers=headers)
        assert healthy.status_code == 200
        assert healthy.json()["sla_breached"] is False
