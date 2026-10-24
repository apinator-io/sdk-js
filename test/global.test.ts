import { describe, it, expect } from "vitest";
import { Apinator } from "../src/index";
import { Channel, PresenceChannel } from "../src/channel";
import "../src/global";

// The script-tag build (dist/apinator.min.js) is src/global.ts bundled as an IIFE.
describe("script-tag global", () => {
  it("sets globalThis.Apinator to the client class", () => {
    const g = (globalThis as { Apinator?: unknown }).Apinator as typeof Apinator & {
      Apinator: unknown;
      Channel: unknown;
      PresenceChannel: unknown;
    };
    expect(g).toBe(Apinator);
    expect(new g({ appKey: "app_x", cluster: "eu" })).toBeInstanceOf(Apinator);
    expect(g.Apinator).toBe(Apinator);
    expect(g.Channel).toBe(Channel);
    expect(g.PresenceChannel).toBe(PresenceChannel);
  });
});
