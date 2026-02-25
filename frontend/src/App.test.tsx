import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function normalizePath(pathname: string): string {
  return pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
}

describe("App integration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("logs in and renders dashboard incident data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      const path = normalizePath(url.pathname);

      if (path === "/auth/login" && method === "POST") {
        return jsonResponse({ access_token: "token-1" });
      }
      if (path === "/users") {
        return jsonResponse([{ id: 1, name: "Jordan Patel", username: "jordan", role: "incident_commander" }]);
      }
      if (path === "/services") {
        return jsonResponse([{ id: 10, name: "Payments API", owner_team: "Core Payments", sla_policy: {} }]);
      }
      if (path === "/metrics") {
        return jsonResponse({
          total_incidents: 1,
          open_incidents: 1,
          closed_incidents: 0,
          mtta_minutes: 2,
          mttr_minutes: 15,
          breach_rate: 0,
        });
      }
      if (path === "/incidents" && method === "GET") {
        return jsonResponse([
          {
            id: 42,
            title: "Checkout timeout",
            description: "Timeout spike",
            severity: "SEV2",
            status: "Investigating",
            service_id: 10,
            assignee_id: 1,
            created_at: new Date().toISOString(),
            acknowledged_at: new Date().toISOString(),
            resolved_at: null,
            closed_at: null,
            sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
            sla_hours: 2,
            sla_breached: false,
          },
        ]);
      }
      if (path === "/incidents/42" && method === "GET") {
        return jsonResponse({
          id: 42,
          title: "Checkout timeout",
          description: "Timeout spike",
          severity: "SEV2",
          status: "Investigating",
          service_id: 10,
          assignee_id: 1,
          created_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString(),
          resolved_at: null,
          closed_at: null,
          sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
          sla_hours: 2,
          sla_breached: false,
          service_name: "Payments API",
          events: [],
          runbooks: [],
          rca: null,
        });
      }
      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incident Dashboard")).toBeInTheDocument();
    expect(await screen.findByText(/#42 Checkout timeout/)).toBeInTheDocument();
  });

  it("transitions a resolved incident to closed from the detail panel", async () => {
    localStorage.setItem("token", "token-2");
    let status = "Resolved";
    let closedAt: string | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      const path = normalizePath(url.pathname);

      if (path === "/users") {
        return jsonResponse([{ id: 1, name: "Jordan Patel", username: "jordan", role: "incident_commander" }]);
      }
      if (path === "/services") {
        return jsonResponse([{ id: 10, name: "Payments API", owner_team: "Core Payments", sla_policy: {} }]);
      }
      if (path === "/metrics") {
        return jsonResponse({
          total_incidents: 1,
          open_incidents: 0,
          closed_incidents: 0,
          mtta_minutes: 2,
          mttr_minutes: 15,
          breach_rate: 0,
        });
      }
      if (path === "/incidents" && method === "GET") {
        return jsonResponse([
          {
            id: 1,
            title: "Resolved incident pending closure",
            description: "Done",
            severity: "SEV2",
            status,
            service_id: 10,
            assignee_id: 1,
            created_at: new Date().toISOString(),
            acknowledged_at: new Date().toISOString(),
            resolved_at: new Date().toISOString(),
            closed_at: closedAt,
            sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
            sla_hours: 2,
            sla_breached: false,
          },
        ]);
      }
      if (path === "/incidents/1" && method === "GET") {
        return jsonResponse({
          id: 1,
          title: "Resolved incident pending closure",
          description: "Done",
          severity: "SEV2",
          status,
          service_id: 10,
          assignee_id: 1,
          created_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          closed_at: closedAt,
          sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
          sla_hours: 2,
          sla_breached: false,
          service_name: "Payments API",
          events: [],
          runbooks: [],
          rca: {
            id: 99,
            incident_id: 1,
            root_cause: "Known root cause",
            contributing_factors: "Known factor",
            corrective_actions: "Known correction",
            prevention_actions: "Known prevention",
          },
        });
      }
      if (path === "/incidents/1/status" && method === "POST") {
        status = "Closed";
        closedAt = new Date().toISOString();
        return jsonResponse({
          id: 1,
          title: "Resolved incident pending closure",
          description: "Done",
          severity: "SEV2",
          status,
          service_id: 10,
          assignee_id: 1,
          created_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          closed_at: closedAt,
          sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
          sla_hours: 2,
          sla_breached: false,
        });
      }
      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const closeButton = await screen.findByRole("button", { name: /Move to Closed/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Move to Closed/i })).not.toBeInTheDocument();
    });
  });
});
