import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAuth } from "../src/auth";

describe("fetchAuth", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with socket_id and channel_name", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auth: "key:sig" }),
    });

    await fetchAuth("123.456", "private-ch", {
      endpoint: "/auth",
    });

    expect(mockFetch).toHaveBeenCalledWith("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socket_id: "123.456",
        channel_name: "private-ch",
      }),
    });
  });

  it("includes custom headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auth: "key:sig" }),
    });

    await fetchAuth("123.456", "private-ch", {
      endpoint: "/auth",
      headers: { Authorization: "Bearer token123" },
    });

    expect(mockFetch).toHaveBeenCalledWith("/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token123",
      },
      body: expect.any(String),
    });
  });

  it("returns auth response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ auth: "key:sig", channel_data: '{"user_id":"1"}' }),
    });

    const result = await fetchAuth("123.456", "presence-ch", {
      endpoint: "/auth",
    });

    expect(result).toEqual({
      auth: "key:sig",
      channel_data: '{"user_id":"1"}',
    });
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    await expect(
      fetchAuth("123.456", "private-ch", { endpoint: "/auth" })
    ).rejects.toThrow("Auth failed: 403 Forbidden");
  });
});
