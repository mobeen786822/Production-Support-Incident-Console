export type User = {
  id: number;
  name: string;
  username: string;
  role: string;
};

export type Service = {
  id: number;
  name: string;
  owner_team: string;
  sla_policy: Record<string, number>;
};

export type Incident = {
  id: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  service_id: number;
  assignee_id: number | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_deadline: string;
  sla_hours: number;
  sla_breached: boolean;
};

export type IncidentEvent = {
  id: number;
  incident_id: number;
  type: string;
  body: string;
  created_by: number | null;
  created_at: string;
};

export type Runbook = {
  id: number;
  service_id: number;
  title: string;
  steps_json: string[];
};

export type RCA = {
  id: number;
  incident_id: number;
  root_cause: string;
  contributing_factors: string;
  corrective_actions: string;
  prevention_actions: string;
};

export type IncidentDetail = Incident & {
  service_name: string;
  events: IncidentEvent[];
  runbooks: Runbook[];
  rca: RCA | null;
};

export type Metrics = {
  total_incidents: number;
  open_incidents: number;
  closed_incidents: number;
  mtta_minutes: number;
  mttr_minutes: number;
  breach_rate: number;
};
