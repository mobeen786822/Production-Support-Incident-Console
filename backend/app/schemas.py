from datetime import datetime
from pydantic import BaseModel, ConfigDict


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    role: str


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_team: str
    sla_policy: dict


class RunbookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    title: str
    steps_json: list[str]


class IncidentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    incident_id: int
    type: str
    body: str
    created_by: int | None
    created_at: datetime


class RCAIn(BaseModel):
    root_cause: str
    contributing_factors: str
    corrective_actions: str
    prevention_actions: str


class RCAOut(RCAIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    incident_id: int


class IncidentCreate(BaseModel):
    title: str
    description: str
    severity: str
    service_id: int
    assignee_id: int | None = None


class IncidentStatusUpdate(BaseModel):
    status: str
    note: str | None = None


class IncidentComment(BaseModel):
    body: str


class RunbookStepApply(BaseModel):
    runbook_id: int
    step_index: int


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    severity: str
    status: str
    service_id: int
    assignee_id: int | None
    created_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    sla_deadline: datetime
    sla_hours: int
    sla_breached: bool


class IncidentDetail(IncidentOut):
    service_name: str
    events: list[IncidentEventOut]
    runbooks: list[RunbookOut]
    rca: RCAOut | None


class MetricsOut(BaseModel):
    total_incidents: int
    open_incidents: int
    closed_incidents: int
    mtta_minutes: float
    mttr_minutes: float
    breach_rate: float


class AlertGenerateIn(BaseModel):
    count: int = 1