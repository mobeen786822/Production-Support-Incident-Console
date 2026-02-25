import type { Incident, IncidentDetail, Metrics, Service, User } from "./types";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" && window.location.origin.startsWith("http")
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:8000");

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parse<{ access_token: string }>(response);
  return data.access_token;
}

export async function getUsers(token: string): Promise<User[]> {
  const response = await fetch(`${API_BASE}/users`, { headers: authHeaders(token) });
  return parse<User[]>(response);
}

export async function getServices(token: string): Promise<Service[]> {
  const response = await fetch(`${API_BASE}/services`, { headers: authHeaders(token) });
  return parse<Service[]>(response);
}

export async function getIncidents(token: string, filters: Record<string, string>): Promise<Incident[]> {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.append(k, v);
  });
  const response = await fetch(`${API_BASE}/incidents?${qs.toString()}`, { headers: authHeaders(token) });
  return parse<Incident[]>(response);
}

export async function createIncident(
  token: string,
  payload: { title: string; description: string; severity: string; service_id: number; assignee_id: number | null },
): Promise<Incident> {
  const response = await fetch(`${API_BASE}/incidents`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parse<Incident>(response);
}

export async function getIncident(token: string, incidentId: number): Promise<IncidentDetail> {
  const response = await fetch(`${API_BASE}/incidents/${incidentId}`, { headers: authHeaders(token) });
  return parse<IncidentDetail>(response);
}

export async function updateStatus(token: string, incidentId: number, status: string, note: string): Promise<Incident> {
  const response = await fetch(`${API_BASE}/incidents/${incidentId}/status`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ status, note }),
  });
  return parse<Incident>(response);
}

export async function addComment(token: string, incidentId: number, body: string): Promise<IncidentDetail> {
  const response = await fetch(`${API_BASE}/incidents/${incidentId}/comments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ body }),
  });
  return parse<IncidentDetail>(response);
}

export async function applyRunbookStep(
  token: string,
  incidentId: number,
  runbookId: number,
  stepIndex: number,
): Promise<IncidentDetail> {
  const response = await fetch(`${API_BASE}/incidents/${incidentId}/apply-runbook-step`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ runbook_id: runbookId, step_index: stepIndex }),
  });
  return parse<IncidentDetail>(response);
}

export async function upsertRca(
  token: string,
  incidentId: number,
  payload: {
    root_cause: string;
    contributing_factors: string;
    corrective_actions: string;
    prevention_actions: string;
  },
) {
  const response = await fetch(`${API_BASE}/incidents/${incidentId}/rca`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parse(response);
}

export async function getMetrics(token: string): Promise<Metrics> {
  const response = await fetch(`${API_BASE}/metrics`, { headers: authHeaders(token) });
  return parse<Metrics>(response);
}

export function reportUrl(incidentId: number): string {
  return `${API_BASE}/incidents/${incidentId}/report.md`;
}

export async function generateAlerts(token: string, count: number): Promise<Incident[]> {
  const response = await fetch(`${API_BASE}/alerts/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ count }),
  });
  return parse<Incident[]>(response);
}
