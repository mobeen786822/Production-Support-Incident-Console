import { slaLabel, utcDate } from "./time";
import type { Incident } from "./types";

describe("API timestamp display", () => {
  afterEach(() => vi.useRealTimers());
  it("interprets offset-free API timestamps as UTC and preserves explicit offsets", () => {
    expect(utcDate("2026-09-08T02:00:00").toISOString()).toBe(
      "2026-09-08T02:00:00.000Z",
    );
    expect(utcDate("2026-09-08T12:00:00+10:00").toISOString()).toBe(
      "2026-09-08T02:00:00.000Z",
    );
    expect(utcDate("2026-09-08T02:00:00Z").toISOString()).toBe(
      "2026-09-08T02:00:00.000Z",
    );
  });
  it("stops the SLA clock at resolution, retaining actual breaches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T03:00:00Z"));
    const incident = {
      sla_breached: false,
      sla_deadline: "2026-09-08T04:00:00",
      resolved_at: null,
      closed_at: null,
    } as Incident;
    expect(slaLabel(incident)).toBe("1h 0m remaining");
    vi.setSystemTime(new Date("2026-09-08T05:00:00Z"));
    expect(slaLabel(incident)).toBe("Breached");
    expect(slaLabel({ ...incident, resolved_at: "2026-09-08T03:30:00" })).toBe(
      "Met",
    );
    expect(
      slaLabel({
        ...incident,
        resolved_at: "2026-09-08T04:30:00",
        sla_breached: true,
      }),
    ).toBe("Breached");
  });
});
