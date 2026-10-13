import type { AuthResponse } from "./types";

export interface AuthOptions {
  endpoint: string;
  headers?: Record<string, string>;
  encoding?: "json" | "form";
}

/** Fetch channel auth from the customer's backend. */
export async function fetchAuth(
  socketId: string,
  channelName: string,
  options: AuthOptions
): Promise<AuthResponse> {
  const params = { socket_id: socketId, channel_name: channelName };
  const form = options.encoding === "form";
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
      ...options.headers,
    },
    body: form ? new URLSearchParams(params).toString() : JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<AuthResponse>;
}
