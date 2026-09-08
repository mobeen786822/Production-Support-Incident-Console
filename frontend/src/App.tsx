import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  downloadReport,
  updateStatus,
  upsertRca,
} from "./api";
import { formatDate, slaLabel } from "./time";
import CustomSelect from "./CustomSelect";
import type { Incident, IncidentDetail, Metrics, Service, User } from "./types";

const STATUS_CHAIN: Record<string, string[]> = {
  New: ["Investigating"],
  Investigating: ["Mitigated", "Resolved"],
  Mitigated: ["Resolved"],
  Resolved: ["Closed"],
  Closed: [],
};

export default function App() {
  const [token, setToken] = useState<string>(
    () => localStorage.getItem("token") ?? "",
  );
  const [username, setUsername] = useState("jordan");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");

  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(
    null,
  );
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentDetail | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [view, setView] = useState<"dashboard" | "metrics">("dashboard");

  const [detailView, setDetailView] = useState<"overview" | "activity" | "rca">(
    "overview",
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    severity: "",
    service_id: "",
    assignee_id: "",
  });
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

  async function perform(
    action: () => Promise<void>,
    success = "Changes saved.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loadRequest = useRef(0);
  const hydrate = useCallback(async () => {
    const request = ++loadRequest.current;
    if (!token) return;
    try {
      const [usersData, servicesData, incidentsData, metricsData] =
        await Promise.all([
          getUsers(token),
          getServices(token),
          getIncidents(token, filters),
          getMetrics(token),
        ]);
      if (request !== loadRequest.current) return;
      setUsers(usersData);
      setServices(servicesData);
      setIncidents(incidentsData);
      setMetrics(metricsData);
      setSelectedIncidentId((current) =>
        incidentsData.some((i) => i.id === current)
          ? current
          : (incidentsData[0]?.id ?? null),
      );
    } catch (err) {
      if (request === loadRequest.current) setError((err as Error).message);
    }
  }, [token, filters]);

  useEffect(() => {
    hydrate();
    const timer = setInterval(hydrate, 30000);
    return () => {
      clearInterval(timer);
      loadRequest.current++;
    };
  }, [hydrate]);

  useEffect(() => {
    if (!token || selectedIncidentId === null) {
      setSelectedIncident(null);
      return;
    }
    let cancelled = false;
    setSelectedIncident(null);
    setComment("");
    setStatusNote("");
    setDetailView("overview");
    getIncident(token, selectedIncidentId)
      .then((data) => {
        if (cancelled) return;
        setSelectedIncident(data);
        setRcaForm({
          root_cause: "",
          contributing_factors: "",
          corrective_actions: "",
          prevention_actions: "",
        });
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
    return () => {
      cancelled = true;
    };
  }, [selectedIncidentId, token]);

  const serviceMap = useMemo(
    () => Object.fromEntries(services.map((s) => [s.id, s.name])),
    [services],
  );
  const userMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  const visibleIncidents = incidents.filter((incident) =>
    `INC-${String(incident.id).padStart(4, "0")} ${incident.id} ${incident.title} ${serviceMap[incident.service_id] ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

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
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <span className="eyebrow">OPERATIONS / DEMO WORKSPACE</span>
          <h1>Incident Console</h1>
          <p>Sign in to review incidents and coordinate the response.</p>
          <p className="demo-credentials">Demo login: jordan / demo123</p>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
          </label>
          <button className="primary" type="submit">
            Sign in
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ic
          </span>
          <div>
            <strong>Incident Console</strong>
            <span>PRODUCTION SUPPORT</span>
          </div>
        </div>
        <nav className="top-actions" aria-label="Workspace">
          <button
            aria-current={view === "dashboard" ? "page" : undefined}
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            Incidents
          </button>
          <button
            aria-current={view === "metrics" ? "page" : undefined}
            className={view === "metrics" ? "active" : ""}
            onClick={() => setView("metrics")}
          >
            Metrics
          </button>
        </nav>
        <div className="session-actions">
          <span className="demo-label">Demo workspace</span>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              setToken("");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            OPERATIONS / {view === "dashboard" ? "INCIDENTS" : "METRICS"}
          </span>
          <h1>{view === "dashboard" ? "Incident desk" : "Response metrics"}</h1>
          <p>
            {view === "dashboard"
              ? "Triage, investigate and hand over."
              : "Response times and outcomes across all incidents."}
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            perform(async () => {
              await generateAlerts(token, 2);
              await hydrate();
            })
          }
        >
          Generate demo alerts
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="action-notice" role="status">
        {notice}
      </p>
      {metrics && view === "dashboard" && (
        <div className="overview-strip" aria-label="All incident totals">
          <div>
            <span>Open incidents</span>
            <strong>{metrics.open_incidents}</strong>
          </div>
          <div>
            <span>Total recorded</span>
            <strong>{metrics.total_incidents}</strong>
          </div>
          <div>
            <span>Average resolution</span>
            <strong>
              {metrics.mttr_minutes}
              <small> min</small>
            </strong>
          </div>
          <div>
            <span>SLA breach rate</span>
            <strong>
              {metrics.breach_rate}
              <small>%</small>
            </strong>
          </div>
        </div>
      )}

      {view === "dashboard" && (
        <section className="dashboard-grid">
          <aside className="panel filter-panel" aria-label="Queue controls">
            <div className="section-heading">
              <h2>Filter queue</h2>
              <button
                className="text-button"
                onClick={() => {
                  setFilters({
                    status: "",
                    severity: "",
                    service_id: "",
                    assignee_id: "",
                  });
                  setSearch("");
                }}
              >
                Reset
              </button>
            </div>
            <CustomSelect
              ariaLabel="Status filter"
              value={filters.status}
              onChange={(next) => setFilters({ ...filters, status: next })}
              options={[
                { value: "", label: "All Statuses" },
                ...Object.keys(STATUS_CHAIN).map((s) => ({
                  value: s,
                  label: s,
                })),
              ]}
            />
            <CustomSelect
              ariaLabel="Severity filter"
              value={filters.severity}
              onChange={(next) => setFilters({ ...filters, severity: next })}
              options={[
                { value: "", label: "All Severities" },
                ...["SEV1", "SEV2", "SEV3", "SEV4"].map((s) => ({
                  value: s,
                  label: s,
                })),
              ]}
            />
            <CustomSelect
              ariaLabel="Service filter"
              value={filters.service_id}
              onChange={(next) => setFilters({ ...filters, service_id: next })}
              options={[
                { value: "", label: "All Services" },
                ...services.map((s) => ({
                  value: String(s.id),
                  label: s.name,
                })),
              ]}
            />
            <CustomSelect
              ariaLabel="Owner filter"
              value={filters.assignee_id}
              onChange={(next) => setFilters({ ...filters, assignee_id: next })}
              options={[
                { value: "", label: "All Owners" },
                ...users.map((u) => ({ value: String(u.id), label: u.name })),
              ]}
            />

            <details className="create-disclosure">
              <summary>New incident</summary>
              <div className="create-form">
                <p className="muted">Log an issue for the response team.</p>
                <label>
                  Title
                  <input
                    aria-label="Title"
                    placeholder="Title"
                    value={newIncident.title}
                    onChange={(e) =>
                      setNewIncident({ ...newIncident, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Description
                  <textarea
                    aria-label="Description"
                    placeholder="Description"
                    value={newIncident.description}
                    onChange={(e) =>
                      setNewIncident({
                        ...newIncident,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <CustomSelect
                  ariaLabel="New incident severity"
                  value={newIncident.severity}
                  onChange={(next) =>
                    setNewIncident({ ...newIncident, severity: next })
                  }
                  options={["SEV1", "SEV2", "SEV3", "SEV4"].map((s) => ({
                    value: s,
                    label: s,
                  }))}
                />
                <CustomSelect
                  ariaLabel="New incident service"
                  value={newIncident.service_id}
                  onChange={(next) =>
                    setNewIncident({ ...newIncident, service_id: next })
                  }
                  options={[
                    { value: "", label: "Select Service" },
                    ...services.map((s) => ({
                      value: String(s.id),
                      label: s.name,
                    })),
                  ]}
                />
                <CustomSelect
                  ariaLabel="New incident assignee"
                  value={newIncident.assignee_id}
                  onChange={(next) =>
                    setNewIncident({ ...newIncident, assignee_id: next })
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...users.map((u) => ({
                      value: String(u.id),
                      label: u.name,
                    })),
                  ]}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      if (
                        !newIncident.service_id ||
                        !newIncident.title.trim() ||
                        !newIncident.description.trim()
                      ) {
                        throw new Error(
                          "Add a title, description and service before creating an incident.",
                        );
                      }
                      await createIncident(token, {
                        title: newIncident.title,
                        description: newIncident.description,
                        severity: newIncident.severity,
                        service_id: Number(newIncident.service_id),
                        assignee_id: newIncident.assignee_id
                          ? Number(newIncident.assignee_id)
                          : null,
                      });
                      setNewIncident({
                        title: "",
                        description: "",
                        severity: "SEV2",
                        service_id: "",
                        assignee_id: "",
                      });
                      await hydrate();
                    })
                  }
                >
                  Create incident
                </button>
              </div>
            </details>
          </aside>

          <section className="panel queue-panel" aria-label="Incident queue">
            <div className="section-heading">
              <h2>Incident queue</h2>
              <span className="count">{visibleIncidents.length}</span>
            </div>
            <label className="search-field">
              <span className="sr-only">Search incidents</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, service or ID"
              />
            </label>
            <div className="incident-list">
              {visibleIncidents.map((incident) => (
                <button
                  key={incident.id}
                  aria-pressed={incident.id === selectedIncidentId}
                  disabled={busy}
                  className={`incident-card ${incident.id === selectedIncidentId ? "selected" : ""}`}
                  onClick={() => setSelectedIncidentId(incident.id)}
                >
                  <div className="incident-row">
                    <strong>
                      <span className="ticket-id">
                        INC-{String(incident.id).padStart(4, "0")}
                      </span>{" "}
                      {incident.title}
                    </strong>
                    <span className={`sev ${incident.severity.toLowerCase()}`}>
                      {incident.severity}
                    </span>
                  </div>
                  <div className="incident-row small">
                    <span className="status-label">{incident.status}</span>
                    <span>{serviceMap[incident.service_id] ?? "Unknown"}</span>
                    <span>
                      {userMap[incident.assignee_id ?? -1] ?? "Unassigned"}
                    </span>
                  </div>
                  <div
                    className={`incident-row small ${slaLabel(incident) === "Breached" ? "breach" : "healthy"}`}
                  >
                    <span>SLA · {slaLabel(incident)}</span>
                  </div>
                </button>
              ))}
              {visibleIncidents.length === 0 && (
                <p className="empty-state">No incidents match these filters.</p>
              )}
            </div>
          </section>

          <section className="panel detail" aria-label="Incident details">
            <span className="eyebrow">
              {selectedIncident
                ? `INC-${String(selectedIncident.id).padStart(4, "0")} / ${selectedIncident.service_name}`
                : "INCIDENT DETAILS"}
            </span>
            <h2 className="detail-title">
              {selectedIncident?.title ?? "Select an incident"}
            </h2>
            {!selectedIncident && (
              <p className="empty-state">
                Choose a ticket from the queue to view its details.
              </p>
            )}
            {selectedIncident && (
              <>
                <div
                  className="detail-tabs"
                  role="group"
                  aria-label="Incident sections"
                >
                  {(["overview", "activity", "rca"] as const).map((section) => (
                    <button
                      key={section}
                      aria-pressed={detailView === section}
                      className={detailView === section ? "active" : ""}
                      onClick={() => setDetailView(section)}
                    >
                      {section === "overview"
                        ? "Overview"
                        : section === "activity"
                          ? `Activity (${selectedIncident.events.length})`
                          : "Root cause"}
                    </button>
                  ))}
                </div>
                <div
                  hidden={detailView !== "overview"}
                  className="detail-section"
                >
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
                      <strong>Created:</strong>{" "}
                      {formatDate(selectedIncident.created_at)}
                    </p>
                    <p>
                      <strong>Resolved:</strong>{" "}
                      {formatDate(selectedIncident.resolved_at)}
                    </p>
                    <p>
                      <strong>SLA:</strong> {slaLabel(selectedIncident)}
                    </p>
                  </div>

                  <p>{selectedIncident.description}</p>

                  <h3>Update status</h3>
                  <label>
                    Transition note
                    <input
                      aria-label="Transition note"
                      placeholder="Transition note"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    {(STATUS_CHAIN[selectedIncident.status] ?? []).map(
                      (next) => (
                        <button
                          key={next}
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await updateStatus(
                                token,
                                selectedIncident.id,
                                next,
                                statusNote || `Status changed to ${next}`,
                              );
                              setStatusNote("");
                              await refreshCurrentIncident();
                            })
                          }
                        >
                          Move to {next}
                        </button>
                      ),
                    )}
                  </div>

                  <h3>Runbooks</h3>
                  {selectedIncident.runbooks.map((runbook) => (
                    <div key={runbook.id} className="runbook">
                      <strong>{runbook.title}</strong>
                      {runbook.steps_json.map((step, idx) => (
                        <button
                          key={idx}
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await applyRunbookStep(
                                token,
                                selectedIncident.id,
                                runbook.id,
                                idx,
                              );
                              await refreshCurrentIncident();
                            })
                          }
                        >
                          {idx + 1}. {step}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div
                  hidden={detailView !== "activity"}
                  className="detail-section"
                >
                  <h3>Activity log</h3>
                  <div className="timeline">
                    {selectedIncident.events.length === 0 && (
                      <p className="muted">No activity recorded yet.</p>
                    )}
                    {selectedIncident.events.map((event) => (
                      <div key={event.id} className="timeline-item">
                        <span>{formatDate(event.created_at)}</span>
                        <span>[{event.type}]</span>
                        <span>{event.body}</span>
                      </div>
                    ))}
                  </div>

                  <label>
                    Add comment
                    <textarea
                      aria-label="Add comment"
                      placeholder="Add comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        if (!comment.trim())
                          throw new Error("Enter a comment before saving.");
                        await addComment(token, selectedIncident.id, comment);
                        setComment("");
                        await refreshCurrentIncident();
                      })
                    }
                  >
                    Add Comment
                  </button>
                </div>
                <div hidden={detailView !== "rca"} className="detail-section">
                  <h3>Root cause analysis</h3>
                  <p className="muted">Required before closing an incident.</p>
                  <label>
                    Root cause
                    <textarea
                      aria-label="Root cause"
                      placeholder="Root cause"
                      value={rcaForm.root_cause}
                      onChange={(e) =>
                        setRcaForm({ ...rcaForm, root_cause: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Contributing factors
                    <textarea
                      aria-label="Contributing factors"
                      placeholder="Contributing factors"
                      value={rcaForm.contributing_factors}
                      onChange={(e) =>
                        setRcaForm({
                          ...rcaForm,
                          contributing_factors: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Corrective actions
                    <textarea
                      aria-label="Corrective actions"
                      placeholder="Corrective actions"
                      value={rcaForm.corrective_actions}
                      onChange={(e) =>
                        setRcaForm({
                          ...rcaForm,
                          corrective_actions: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Prevention actions
                    <textarea
                      aria-label="Prevention actions"
                      placeholder="Prevention actions"
                      value={rcaForm.prevention_actions}
                      onChange={(e) =>
                        setRcaForm({
                          ...rcaForm,
                          prevention_actions: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        await upsertRca(token, selectedIncident.id, rcaForm);
                        await refreshCurrentIncident();
                      })
                    }
                  >
                    Save RCA
                  </button>
                </div>

                <button
                  className="report-download"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await downloadReport(token, selectedIncident.id);
                    }, "Report downloaded.")
                  }
                >
                  Download incident report ↓
                </button>
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
            <h2>Response times (minutes)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: "MTTA", value: metrics.mtta_minutes },
                  { name: "MTTR", value: metrics.mttr_minutes },
                ]}
              >
                <XAxis dataKey="name" />
                <YAxis unit="m" />
                <Tooltip />
                <Bar dataKey="value" fill="#425e50" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        </section>
      )}
    </main>
  );
}
