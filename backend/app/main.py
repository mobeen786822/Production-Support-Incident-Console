from datetime import datetime
from statistics import mean
from random import choice

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .auth import create_access_token, get_current_user
from .config import get_settings
from .db import Base, SessionLocal, engine, get_db
from .models import Incident, IncidentEvent, RCA, Runbook, Service, User
from .schemas import (
    AlertGenerateIn,
    IncidentComment,
    IncidentCreate,
    IncidentDetail,
    IncidentOut,
    IncidentStatusUpdate,
    MetricsOut,
    RCAIn,
    RCAOut,
    RunbookOut,
    RunbookStepApply,
    ServiceOut,
    TokenRequest,
    TokenResponse,
    UserOut,
)
from .seed import seed
from .sla import breach_state, deadline, severity_hours

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_TRANSITIONS = {
    "New": {"Investigating"},
    "Investigating": {"Mitigated", "Resolved"},
    "Mitigated": {"Resolved"},
    "Resolved": {"Closed"},
    "Closed": set(),
}


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: TokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or user.password != payload.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenResponse(access_token=create_access_token(user.id))


@app.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[UserOut]:
    return db.query(User).order_by(User.name).all()


@app.get("/services", response_model=list[ServiceOut])
def list_services(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ServiceOut]:
    return db.query(Service).order_by(Service.name).all()


@app.get("/runbooks", response_model=list[RunbookOut])
def list_runbooks(
    service_id: int | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RunbookOut]:
    query = db.query(Runbook)
    if service_id:
        query = query.filter(Runbook.service_id == service_id)
    return query.order_by(Runbook.title).all()


def to_incident_out(incident: Incident) -> IncidentOut:
    sla_hours = severity_hours(incident.service.sla_policy if incident.service else None, incident.severity)
    end_time = incident.closed_at or incident.resolved_at or datetime.utcnow()
    return IncidentOut(
        id=incident.id,
        title=incident.title,
        description=incident.description,
        severity=incident.severity,
        status=incident.status,
        service_id=incident.service_id,
        assignee_id=incident.assignee_id,
        created_at=incident.created_at,
        acknowledged_at=incident.acknowledged_at,
        resolved_at=incident.resolved_at,
        closed_at=incident.closed_at,
        sla_deadline=deadline(incident.created_at, sla_hours),
        sla_hours=sla_hours,
        sla_breached=breach_state(incident.created_at, end_time, sla_hours),
    )


@app.get("/incidents", response_model=list[IncidentOut])
def list_incidents(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    service_id: int | None = Query(default=None),
    assignee_id: int | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IncidentOut]:
    query = db.query(Incident).join(Service, Incident.service_id == Service.id)
    if status:
        query = query.filter(Incident.status == status)
    if severity:
        query = query.filter(Incident.severity == severity)
    if service_id:
        query = query.filter(Incident.service_id == service_id)
    if assignee_id:
        query = query.filter(Incident.assignee_id == assignee_id)

    incidents = query.order_by(Incident.created_at.desc()).all()
    return [to_incident_out(i) for i in incidents]


@app.post("/incidents", response_model=IncidentOut)
def create_incident(
    payload: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentOut:
    incident = Incident(
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        status="New",
        service_id=payload.service_id,
        assignee_id=payload.assignee_id,
    )
    db.add(incident)
    db.flush()

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            type="status_change",
            body="Incident created with status New",
            created_by=current_user.id,
        )
    )
    db.commit()
    db.refresh(incident)
    return to_incident_out(incident)


@app.get("/incidents/{incident_id}", response_model=IncidentDetail)
def get_incident(
    incident_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentDetail:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    runbooks = db.query(Runbook).filter(Runbook.service_id == incident.service_id).all()
    events = db.query(IncidentEvent).filter(IncidentEvent.incident_id == incident_id).order_by(IncidentEvent.created_at.asc()).all()
    incident_base = to_incident_out(incident)

    return IncidentDetail(
        **incident_base.model_dump(),
        service_name=incident.service.name if incident.service else "Unknown",
        events=events,
        runbooks=runbooks,
        rca=incident.rca,
    )


@app.post("/incidents/{incident_id}/status", response_model=IncidentOut)
def update_status(
    incident_id: int,
    payload: IncidentStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentOut:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    allowed = ALLOWED_TRANSITIONS.get(incident.status, set())
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid transition from {incident.status} to {payload.status}")

    if payload.status == "Closed":
        if not incident.rca:
            raise HTTPException(status_code=400, detail="RCA is required before closing an incident")
        rca_fields = [
            incident.rca.root_cause,
            incident.rca.contributing_factors,
            incident.rca.corrective_actions,
            incident.rca.prevention_actions,
        ]
        if any(not x.strip() for x in rca_fields):
            raise HTTPException(status_code=400, detail="All RCA fields are required before closing")

    if payload.status == "Investigating" and incident.acknowledged_at is None:
        incident.acknowledged_at = datetime.utcnow()
    if payload.status == "Resolved":
        incident.resolved_at = datetime.utcnow()
    if payload.status == "Closed":
        incident.closed_at = datetime.utcnow()

    incident.status = payload.status
    event_body = payload.note or f"Status changed to {payload.status}"
    db.add(IncidentEvent(incident_id=incident.id, type="status_change", body=event_body, created_by=current_user.id))

    db.commit()
    db.refresh(incident)
    return to_incident_out(incident)


@app.post("/incidents/{incident_id}/comments", response_model=IncidentDetail)
def add_comment(
    incident_id: int,
    payload: IncidentComment,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentDetail:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    db.add(IncidentEvent(incident_id=incident_id, type="comment", body=payload.body, created_by=current_user.id))
    db.commit()
    return get_incident(incident_id, current_user, db)


@app.post("/incidents/{incident_id}/apply-runbook-step", response_model=IncidentDetail)
def apply_runbook_step(
    incident_id: int,
    payload: RunbookStepApply,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncidentDetail:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    runbook = db.query(Runbook).filter(Runbook.id == payload.runbook_id).first()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if not runbook or runbook.service_id != incident.service_id:
        raise HTTPException(status_code=404, detail="Runbook not found for this service")
    if payload.step_index < 0 or payload.step_index >= len(runbook.steps_json):
        raise HTTPException(status_code=400, detail="Invalid runbook step index")

    step = runbook.steps_json[payload.step_index]
    db.add(
        IncidentEvent(
            incident_id=incident_id,
            type="runbook_step",
            body=f"Applied runbook '{runbook.title}' step {payload.step_index + 1}: {step}",
            created_by=current_user.id,
        )
    )
    db.commit()
    return get_incident(incident_id, current_user, db)


@app.put("/incidents/{incident_id}/rca", response_model=RCAOut)
def upsert_rca(
    incident_id: int,
    payload: RCAIn,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RCAOut:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    rca = db.query(RCA).filter(RCA.incident_id == incident_id).first()
    if rca:
        rca.root_cause = payload.root_cause
        rca.contributing_factors = payload.contributing_factors
        rca.corrective_actions = payload.corrective_actions
        rca.prevention_actions = payload.prevention_actions
    else:
        rca = RCA(incident_id=incident_id, **payload.model_dump())
        db.add(rca)

    db.commit()
    db.refresh(rca)
    return rca


@app.get("/incidents/{incident_id}/report.md", response_class=PlainTextResponse)
def export_markdown_report(
    incident_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    events = db.query(IncidentEvent).filter(IncidentEvent.incident_id == incident_id).order_by(IncidentEvent.created_at.asc()).all()
    sla_hours = severity_hours(incident.service.sla_policy if incident.service else None, incident.severity)
    end_time = incident.closed_at or incident.resolved_at or datetime.utcnow()
    breached = breach_state(incident.created_at, end_time, sla_hours)

    lines = [
        f"# Incident Report: {incident.title}",
        "",
        f"- Incident ID: {incident.id}",
        f"- Severity: {incident.severity}",
        f"- Status: {incident.status}",
        f"- Service: {incident.service.name if incident.service else 'Unknown'}",
        f"- Created: {incident.created_at.isoformat()}",
        f"- Resolved: {incident.resolved_at.isoformat() if incident.resolved_at else 'N/A'}",
        f"- Closed: {incident.closed_at.isoformat() if incident.closed_at else 'N/A'}",
        f"- SLA Target (hours): {sla_hours}",
        f"- SLA Breached: {'Yes' if breached else 'No'}",
        "",
        "## Summary",
        incident.description,
        "",
        "## Timeline",
    ]

    for event in events:
        lines.append(f"- {event.created_at.isoformat()} [{event.type}] {event.body}")

    lines.append("")
    lines.append("## RCA")
    if incident.rca:
        lines.extend([
            f"- Root cause: {incident.rca.root_cause}",
            f"- Contributing factors: {incident.rca.contributing_factors}",
            f"- Corrective actions: {incident.rca.corrective_actions}",
            f"- Prevention actions: {incident.rca.prevention_actions}",
        ])
    else:
        lines.append("RCA not completed.")

    return "\n".join(lines)


@app.get("/metrics", response_model=MetricsOut)
def metrics(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MetricsOut:
    incidents = db.query(Incident).all()
    if not incidents:
        return MetricsOut(total_incidents=0, open_incidents=0, closed_incidents=0, mtta_minutes=0, mttr_minutes=0, breach_rate=0)

    closed_or_resolved = [i for i in incidents if i.resolved_at or i.closed_at]
    open_incidents = [i for i in incidents if i.status not in {"Resolved", "Closed"}]

    ack_durations = []
    for incident in incidents:
        if incident.acknowledged_at:
            ack_durations.append((incident.acknowledged_at - incident.created_at).total_seconds() / 60)

    resolve_durations = []
    breaches = []
    for incident in closed_or_resolved:
        end_time = incident.closed_at or incident.resolved_at
        if end_time:
            resolve_durations.append((end_time - incident.created_at).total_seconds() / 60)
            hours = severity_hours(incident.service.sla_policy if incident.service else None, incident.severity)
            breaches.append(1 if breach_state(incident.created_at, end_time, hours) else 0)

    return MetricsOut(
        total_incidents=len(incidents),
        open_incidents=len(open_incidents),
        closed_incidents=len([i for i in incidents if i.status == "Closed"]),
        mtta_minutes=round(mean(ack_durations), 2) if ack_durations else 0,
        mttr_minutes=round(mean(resolve_durations), 2) if resolve_durations else 0,
        breach_rate=round((sum(breaches) / len(breaches)) * 100, 2) if breaches else 0,
    )


@app.post("/alerts/generate", response_model=list[IncidentOut])
def generate_alerts(
    payload: AlertGenerateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IncidentOut]:
    services = db.query(Service).all()
    if not services:
        return []

    created = []
    for idx in range(max(1, min(payload.count, 25))):
        sev = choice(["SEV1", "SEV2", "SEV3", "SEV4"])
        service = choice(services)
        incident = Incident(
            title=f"Synthetic alert #{idx + 1} - {service.name}",
            description="Generated from mock log rule: error_rate > threshold.",
            severity=sev,
            status="New",
            service_id=service.id,
            assignee_id=current_user.id,
        )
        db.add(incident)
        db.flush()
        db.add(
            IncidentEvent(
                incident_id=incident.id,
                type="alert",
                body="Synthetic alert generated from mock log rule",
                created_by=current_user.id,
            )
        )
        created.append(incident)

    db.commit()
    return [to_incident_out(i) for i in created]
