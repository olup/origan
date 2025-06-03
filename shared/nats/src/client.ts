import type { JetStreamClient } from "@nats-io/jetstream/lib/types";
import type { NatsConnection } from "@nats-io/nats-core";
import { createConnection } from "./connection";
import { Publisher } from "./publisher";
import { Subscriber } from "./subscriber";
import type { NatsConfig } from "./types";

export class NatsAlreadyConnectedError extends Error {
  constructor(
    message = "NATS client already connected. Following connect calls are forbidden.",
  ) {
    super(message);
    this.name = "NatsAlreadyConnectedError";
  }
}

export class NatsClient {
  private connection: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private _publisher: Publisher | null = null;
  private _subscriber: Subscriber | null = null;

  constructor(private config: NatsConfig) {}

  async connect(): Promise<void> {
    if (this.connection && this.js) {
      throw new NatsAlreadyConnectedError();
    }

    const { nc, js } = await createConnection(this.config);
    this.connection = nc;
    this.js = js;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.js = null;
      this._publisher = null;
      this._subscriber = null;
    }
  }

  get publisher(): Publisher {
    if (!this.js) {
      throw new Error("NATS client not connected. Call connect() first.");
    }
    if (!this._publisher) {
      this._publisher = new Publisher(this.js);
    }
    return this._publisher;
  }

  get subscriber(): Subscriber {
    if (!this.connection) {
      throw new Error("NATS client not connected. Call connect() first.");
    }
    if (!this._subscriber) {
      this._subscriber = new Subscriber(this.connection);
    }
    return this._subscriber;
  }
}
