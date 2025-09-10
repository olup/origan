import alchemy, { BaseResource } from "alchemy";
import { K3sApi } from "./api.js";

export interface ServiceAccountProps {
  namespace: string;
  labels?: Record<string, string>;
}

export class ServiceAccount extends BaseResource {
  name: string;
  namespace: string;

  constructor(name: string, props: ServiceAccountProps) {
    super(name);
    this.name = name;
    this.namespace = props.namespace;
  }

  async refresh() {
    const api = new K3sApi();
    try {
      const result = await api.get(
        `/api/v1/namespaces/${this.namespace}/serviceaccounts/${this.name}`,
      );
      return { exists: true, resource: result };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  async create(props: ServiceAccountProps) {
    const api = new K3sApi();

    const manifest = {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: this.name,
        namespace: props.namespace,
        labels: props.labels,
      },
    };

    await api.post(
      `/api/v1/namespaces/${props.namespace}/serviceaccounts`,
      manifest,
    );
    console.log(
      `✅ ServiceAccount ${this.name} created in namespace ${props.namespace}`,
    );
  }

  async update(props: ServiceAccountProps) {
    // ServiceAccounts typically don't need updates
    // If needed, implement a patch operation here
    console.log(`ServiceAccount ${this.name} is up to date`);
  }

  async delete() {
    const api = new K3sApi();
    await api.delete(
      `/api/v1/namespaces/${this.namespace}/serviceaccounts/${this.name}`,
    );
    console.log(
      `🗑️ ServiceAccount ${this.name} deleted from namespace ${this.namespace}`,
    );
  }
}

export default function (name: string, props: ServiceAccountProps) {
  return alchemy.resource(new ServiceAccount(name, props));
}
