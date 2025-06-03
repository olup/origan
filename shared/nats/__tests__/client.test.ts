import { beforeEach, describe, expect, it, vi } from "vitest";
import { NatsClient } from "../src/client";
import { Publisher } from "../src/publisher";
import { Subscriber } from "../src/subscriber";

vi.mock("../src/connection", () => ({
  createConnection: vi.fn().mockResolvedValue({
    nc: {
      close: vi.fn().mockResolvedValue(undefined),
    },
    js: {},
  }),
}));

describe("NatsClient", () => {
  let client: NatsClient;

  beforeEach(() => {
    client = new NatsClient({
      server: "nats://localhost:4222",
    });
  });

  it("should create publisher after connection", async () => {
    await client.connect();
    expect(client.publisher).toBeInstanceOf(Publisher);
  });

  it("should create subscriber after connection", async () => {
    await client.connect();
    expect(client.subscriber).toBeInstanceOf(Subscriber);
  });

  it("should throw if accessing publisher before connection", () => {
    expect(() => client.publisher).toThrow("NATS client not connected");
  });

  it("should throw if accessing subscriber before connection", () => {
    expect(() => client.subscriber).toThrow("NATS client not connected");
  });

  it("should clean up resources on disconnect", async () => {
    await client.connect();
    // Access publisher and subscriber to ensure they're created
    client.publisher;
    client.subscriber;

    await client.disconnect();

    expect(() => client.publisher).toThrow("NATS client not connected");
    expect(() => client.subscriber).toThrow("NATS client not connected");
  });
});
