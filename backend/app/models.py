from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="engineer")


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    owner_team: Mapped[str] = mapped_column(String(120), nullable=False)
    sla_policy: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    runbooks: Mapped[list["Runbook"]] = relationship(back_populates="service", cascade="all, delete-orphan")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="New")
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False, index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    service: Mapped["Service"] = relationship()
    assignee: Mapped["User"] = relationship()
    events: Mapped[list["IncidentEvent"]] = relationship(back_populates="incident", cascade="all, delete-orphan")
    rca: Mapped["RCA"] = relationship(back_populates="incident", uselist=False, cascade="all, delete-orphan")


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    incident: Mapped["Incident"] = relationship(back_populates="events")


class Runbook(Base):
    __tablename__ = "runbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    steps_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    service: Mapped["Service"] = relationship(back_populates="runbooks")


class RCA(Base):
    __tablename__ = "rcas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False, unique=True, index=True)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    contributing_factors: Mapped[str] = mapped_column(Text, nullable=False)
    corrective_actions: Mapped[str] = mapped_column(Text, nullable=False)
    prevention_actions: Mapped[str] = mapped_column(Text, nullable=False)

    incident: Mapped["Incident"] = relationship(back_populates="rca")