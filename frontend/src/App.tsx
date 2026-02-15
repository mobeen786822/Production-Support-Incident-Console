import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  addComment,
  applyRunbookStep,
  createIncident,
  generateAlerts,
  getIncident,
  getIncidents,
  getMetrics,
  getServices,
  getUsers,
  login,
  reportUrl,
  updateStatus,
  upsertRca,
} from "./api";
import type { Incident, IncidentDetail, Metrics, Service, User } from "./types";

const STATUS_CHAIN: Record<string, string[]> = {
  New: ["Investigating"],
  Investigating: ["Mitigated", "Resolved"],
  Mitigated: ["Resolved"],
  Resolved: ["Closed"],
  Closed: [],
};

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function countdown(deadlineIso: string): string {
  const delta = new Date(deadlineIso).getTime() - Date.now();
  if (delta <= 0) return "Breached";
  const hours = Math.floor(delta / 3600000);
  const minutes = Math.floor((delta % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem("token") ?? "");
  const [username, setUsername] = useState("jordan");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");

  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [view, setView] = useState<"dashboard" | "metrics">("dashboard");

  const [filters, setFilters] = useState({ status: "", severity: "", service_id: "", assignee_id: "" });
  const [newIncident, setNewIncident] = useState({
    title: "",
    description: "",
    severity: "SEV2",
    service_id: "",
    assignee_id: "",
  });
  const [comment, setComment] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [rcaForm, setRcaForm] = useState({
    root_cause: "",
    contributing_factors: "",
    corrective_actions: "",
    prevention_actions: "",
  });

  async function hydrate() {
    if (!token) return;
    try {
      const [usersData, servicesData, incidentsData, metricsData] = await Promise.all([
        getUsers(token),
        getServices(token),
        getIncidents(token, filters),
        getMetrics(token),
      ]);
      setUsers(usersData);
      setServices(servicesData);
      setIncidents(incidentsData);
      setMetrics(metricsData);
      if (!selectedIncidentId && incidentsData.length > 0) {
        setSelectedIncidentId(incidentsData[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    hydrate();
    const timer = setInterval(() => hydrate(), 30000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    getIncidents(token, filters)
      .then((data) => {
        setIncidents(data);
        if (selectedIncidentId && !data.find((i) => i.id === selectedIncidentId)) {
          setSelectedIncidentId(data[0]?.id ?? null);
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [filters, token]);

  useEffect(() => {
    if (!token || selectedIncidentId === null) {
      setSelectedIncident(null);
      return;
    }
    getIncident(token, selectedIncidentId)
      .then((data) => {
        setSelectedIncident(data);
        if (data.rca) {
          setRcaForm({
            root_cause: data.rca.root_cause,
            contributing_factors: data.rca.contributing_factors,
            corrective_actions: data.rca.corrective_actions,
            prevention_actions: data.rca.prevention_actions,
          });
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [selectedIncidentId, token]);

  const serviceMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s.name])), [services]);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  async function handleLogin() {
    try {
      const t = await login(username, password);
      localStorage.setItem("token", t);
      setToken(t);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function refreshCurrentIncident() {
    await hydrate();
    if (selectedIncidentId) {
      const detail = await getIncident(token, selectedIncidentId);
      setSelectedIncident(detail);
    }
  }

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <h1>Incident Console</h1>
          <p>Demo login: jordan / demo123</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <button onClick={handleLogin}>Sign in</button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <h1>Production Support Incident Console</h1>
          <p>Simulated incident management workflow with SLA and RCA controls.</p>
        </div>
        <div className="top-actions">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={view === "metrics" ? "active" : ""} onClick={() => setView("metrics")}>
            Metrics
          </button>
          <button
            onClick={async () => {
              await generateAlerts(token, 2);
              await hydrate();
            }}
          >
            Generate Alerts
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              setToken("");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {view === "dashboard" && (
        <section className="dashboard-grid">
          <aside className="panel">
            <h2>Filters</h2>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All Statuses</option>
              {Object.keys(STATUS_CHAIN).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
              <option value="">All Severities</option>
              {["SEV1", "SEV2", "SEV3", "SEV4"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={filters.service_id} onChange={(e) => setFilters({ ...filters, service_id: e.target.value })}>
              <option value="">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={filters.assignee_id} onChange={(e) => setFilters({ ...filters, assignee_id: e.target.value })}>
              <option value="">All Owners</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <h2>Create Incident</h2>
            <input placeholder="Title" value={newIncident.title} onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })} />
            <textarea
              placeholder="Description"
              value={newIncident.description}
              onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
            />
            <select value={newIncident.severity} onChange={(e) => setNewIncident({ ...newIncident, severity: e.target.value })}>
              {["SEV1", "SEV2", "SEV3", "SEV4"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={newIncident.service_id} onChange={(e) => setNewIncident({ ...newIncident, service_id: e.target.value })}>
              <option value="">Select Service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={newIncident.assignee_id} onChange={(e) => setNewIncident({ ...newIncident, assignee_id: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!newIncident.service_id) return;
                await createIncident(token, {
                  title: newIncident.title,
                  description: newIncident.description,
                  severity: newIncident.severity,
                  service_id: Number(newIncident.service_id),
                  assignee_id: newIncident.assignee_id ? Number(newIncident.assignee_id) : null,
                });
                setNewIncident({ title: "", description: "", severity: "SEV2", service_id: "", assignee_id: "" });
                await hydrate();
              }}
            >
              Create
            </button>
          </aside>

          <section className="panel">
            <h2>Incident Dashboard</h2>
            <div className="incident-list">
              {incidents.map((incident) => (
                <button
                  key={incident.id}
                  className={`incident-card ${incident.id === selectedIncidentId ? "selected" : ""}`}
                  onClick={() => setSelectedIncidentId(incident.id)}
                >
                  <div className="incident-row">
                    <strong>
                      #{incident.id} {incident.title}
                    </strong>
                    <span className={`sev ${incident.severity.toLowerCase()}`}>{incident.severity}</span>
                  </div>
                  <div className="incident-row small">
                    <span>{incident.status}</span>
                    <span>{serviceMap[incident.service_id] ?? "Unknown"}</span>
                    <span>{userMap[incident.assignee_id ?? -1] ?? "Unassigned"}</span>
                  </div>
                  <div className={`incident-row small ${incident.sla_breached ? "breach" : "healthy"}`}>
                    <span>SLA: {countdown(incident.sla_deadline)}</span>
                    <span>{incident.sla_breached ? "Breached" : "Within target"}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel detail">
            <h2>Ticket Detail</h2>
            {!selectedIncident && <p>Select an incident.</p>}
            {selectedIncident && (
              <>
                <div className="detail-grid">
                  <p>
                    <strong>Status:</strong> {selectedIncident.status}
                  </p>
                  <p>
                    <strong>Service:</strong> {selectedIncident.service_name}
                  </p>
                  <p>
                    <strong>Severity:</strong> {selectedIncident.severity}
                  </p>
                  <p>
                    <strong>Created:</strong> {formatDate(selectedIncident.created_at)}
                  </p>
                  <p>
                    <strong>Resolved:</strong> {formatDate(selectedIncident.resolved_at)}
                  </p>
                  <p>
                    <strong>SLA:</strong> {selectedIncident.sla_breached ? "Breached" : countdown(selectedIncident.sla_deadline)}
                  </p>
                </div>

                <p>{selectedIncident.description}</p>

                <h3>Status Transition</h3>
                <input placeholder="Transition note" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                <div className="button-row">
                  {(STATUS_CHAIN[selectedIncident.status] ?? []).map((next) => (
                    <button
                      key={next}
                      onClick={async () => {
                        await updateStatus(token, selectedIncident.id, next, statusNote || `Status changed to ${next}`);
                        setStatusNote("");
                        await refreshCurrentIncident();
                      }}
                    >
                      Move to {next}
                    </button>
                  ))}
                </div>

                <h3>Runbooks</h3>
                {selectedIncident.runbooks.map((runbook) => (
                  <div key={runbook.id} className="runbook">
                    <strong>{runbook.title}</strong>
                    {runbook.steps_json.map((step, idx) => (
                      <button
                        key={idx}
                        onClick={async () => {
                          await applyRunbookStep(token, selectedIncident.id, runbook.id, idx);
                          await refreshCurrentIncident();
                        }}
                      >
                        {idx + 1}. {step}
                      </button>
                    ))}
                  </div>
                ))}

                <h3>Timeline</h3>
                <div className="timeline">
                  {selectedIncident.events.map((event) => (
                    <div key={event.id} className="timeline-item">
                      <span>{formatDate(event.created_at)}</span>
                      <span>[{event.type}]</span>
                      <span>{event.body}</span>
                    </div>
                  ))}
                </div>

                <textarea placeholder="Add comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                <button
                  onClick={async () => {
                    if (!comment.trim()) return;
                    await addComment(token, selectedIncident.id, comment);
                    setComment("");
                    await refreshCurrentIncident();
                  }}
                >
                  Add Comment
                </button>

                <h3>RCA (required for closure)</h3>
                <textarea
                  placeholder="Root cause"
                  value={rcaForm.root_cause}
                  onChange={(e) => setRcaForm({ ...rcaForm, root_cause: e.target.value })}
                />
                <textarea
                  placeholder="Contributing factors"
                  value={rcaForm.contributing_factors}
                  onChange={(e) => setRcaForm({ ...rcaForm, contributing_factors: e.target.value })}
                />
                <textarea
                  placeholder="Corrective actions"
                  value={rcaForm.corrective_actions}
                  onChange={(e) => setRcaForm({ ...rcaForm, corrective_actions: e.target.value })}
                />
                <textarea
                  placeholder="Prevention actions"
                  value={rcaForm.prevention_actions}
                  onChange={(e) => setRcaForm({ ...rcaForm, prevention_actions: e.target.value })}
                />
                <button
                  onClick={async () => {
                    await upsertRca(token, selectedIncident.id, rcaForm);
                    await refreshCurrentIncident();
                  }}
                >
                  Save RCA
                </button>

                <a href={reportUrl(selectedIncident.id)} target="_blank" rel="noreferrer">
                  Export Post-Incident Report (Markdown)
                </a>
              </>
            )}
          </section>
        </section>
      )}

      {view === "metrics" && metrics && (
        <section className="metrics-grid">
          <article className="panel metric-card">
            <h2>Total Incidents</h2>
            <p>{metrics.total_incidents}</p>
          </article>
          <article className="panel metric-card">
            <h2>Open Incidents</h2>
            <p>{metrics.open_incidents}</p>
          </article>
          <article className="panel metric-card">
            <h2>Closed Incidents</h2>
            <p>{metrics.closed_incidents}</p>
          </article>
          <article className="panel metric-card">
            <h2>MTTA</h2>
            <p>{metrics.mtta_minutes} min</p>
          </article>
          <article className="panel metric-card">
            <h2>MTTR</h2>
            <p>{metrics.mttr_minutes} min</p>
          </article>
          <article className="panel metric-card">
            <h2>Breach Rate</h2>
            <p>{metrics.breach_rate}%</p>
          </article>
          <article className="panel chart-card">
            <h2>Incident KPI Snapshot</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: "MTTA", value: metrics.mtta_minutes },
                  { name: "MTTR", value: metrics.mttr_minutes },
                  { name: "Breach %", value: metrics.breach_rate },
                ]}
              >
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#c26900" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        </section>
      )}
    </main>
  );
}
