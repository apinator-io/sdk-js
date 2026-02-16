import type { AuthResponse } from "./types";

export interface AuthOptions {
  endpoint: string;
  headers?: Record<string, string>;
}

/** Fetch channel auth from the customer's backend. */
export async function fetchAuth(
  socketId: string,
  channelName: string,
  options: AuthOptions
): Promise<AuthResponse> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: JSON.stringify({
      socket_id: socketId,
      channel_name: channelName,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<AuthResponse>;
}
