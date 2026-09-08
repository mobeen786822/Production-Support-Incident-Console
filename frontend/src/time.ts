import type { Incident } from "./types";

// The API serializes UTC datetimes without an offset. Explicit offsets remain intact.
export function utcDate(value: string): Date {
  return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

export function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  return utcDate(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function slaLabel(incident: Incident): string {
  if (incident.sla_breached) return "Breached";
  if (incident.resolved_at || incident.closed_at) return "Met";
  const delta = utcDate(incident.sla_deadline).getTime() - Date.now();
  if (delta <= 0) return "Breached";
  const minutes = Math.ceil(delta / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
}
