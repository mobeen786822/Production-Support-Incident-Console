from datetime import datetime

from sqlalchemy.orm import Session

from .models import Incident, IncidentEvent, RCA, Runbook, Service, User


def seed(db: Session) -> None:
    if db.query(User).count() > 0:
        return

    users = [
        User(name="Avery Chen", username="avery", password="demo123", role="engineer"),
        User(name="Jordan Patel", username="jordan", password="demo123", role="incident_commander"),
        User(name="Morgan Diaz", username="morgan", password="demo123", role="manager"),
    ]
    db.add_all(users)
    db.flush()

    services = [
        Service(name="Payments API", owner_team="Core Payments", sla_policy={"SEV1": 1, "SEV2": 2, "SEV3": 6, "SEV4": 24}),
        Service(name="Identity Service", owner_team="Platform Identity", sla_policy={"SEV1": 1, "SEV2": 4, "SEV3": 8, "SEV4": 24}),
        Service(name="Order Pipeline", owner_team="Fulfillment Ops", sla_policy={"SEV1": 2, "SEV2": 4, "SEV3": 12, "SEV4": 24}),
    ]
    db.add_all(services)
    db.flush()

    runbooks = [
        Runbook(service_id=services[0].id, title="Payments Timeout Mitigation", steps_json=[
            "Check p95 latency and error rate on API gateway dashboard",
            "Scale worker pool by +2 instances",
            "Enable retry backoff patch in feature flag console",
            "Purge stuck jobs older than 10 minutes",
        ]),
        Runbook(service_id=services[1].id, title="Identity Login Failure", steps_json=[
            "Validate OAuth provider health endpoints",
            "Rotate cached signing keys",
            "Flush auth gateway cache",
        ]),
    ]
    db.add_all(runbooks)
    db.flush()

    incident = Incident(
        title="Spike in payment authorization timeouts",
        description="Checkout requests are timing out in us-east-1.",
        severity="SEV2",
        status="Investigating",
        service_id=services[0].id,
        assignee_id=users[1].id,
        created_at=datetime.utcnow(),
        acknowledged_at=datetime.utcnow(),
    )
    db.add(incident)
    db.flush()

    db.add_all([
        IncidentEvent(incident_id=incident.id, type="status_change", body="Incident created with status New", created_by=users[0].id),
        IncidentEvent(incident_id=incident.id, type="status_change", body="Moved to Investigating", created_by=users[1].id),
        IncidentEvent(incident_id=incident.id, type="comment", body="Initial rollback did not improve latency.", created_by=users[1].id),
    ])

    db.commit()