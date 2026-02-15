from datetime import datetime, timedelta

DEFAULT_SLA_HOURS = {
    "SEV1": 1,
    "SEV2": 4,
    "SEV3": 8,
    "SEV4": 24,
}


def severity_hours(service_policy: dict | None, severity: str) -> int:
    policy = service_policy or {}
    if severity in policy:
        return int(policy[severity])
    return DEFAULT_SLA_HOURS.get(severity, 24)


def deadline(created_at: datetime, hours: int) -> datetime:
    return created_at + timedelta(hours=hours)


def breach_state(created_at: datetime, end_time: datetime, hours: int) -> bool:
    return end_time > deadline(created_at, hours)