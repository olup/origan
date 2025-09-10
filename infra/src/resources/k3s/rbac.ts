import alchemy from "alchemy";

import { K3sApi } from "./api.js";

export interface ClusterRoleProps {
  rules: Array<{
    apiGroups: string[];
    resources: string[];
    verbs: string[];
  }>;
  labels?: Record<string, string>;
}

export class ClusterRole extends BaseResource {
  name: string;

  constructor(name: string) {
    super(name);
    this.name = name;
  }

  async refresh() {
    const api = new K3sApi();
    try {
      const result = await api.get(
        `/apis/rbac.authorization.k8s.io/v1/clusterroles/${this.name}`,
      );
      return { exists: true, resource: result };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  async create(props: ClusterRoleProps) {
    const api = new K3sApi();

    const manifest = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: {
        name: this.name,
        labels: props.labels,
      },
      rules: props.rules,
    };

    await api.post("/apis/rbac.authorization.k8s.io/v1/clusterroles", manifest);
    console.log(`✅ ClusterRole ${this.name} created`);
  }

  async update(props: ClusterRoleProps) {
    const api = new K3sApi();

    const manifest = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: {
        name: this.name,
        labels: props.labels,
      },
      rules: props.rules,
    };

    await api.put(
      `/apis/rbac.authorization.k8s.io/v1/clusterroles/${this.name}`,
      manifest,
    );
    console.log(`✅ ClusterRole ${this.name} updated`);
  }

  async delete() {
    const api = new K3sApi();
    await api.delete(
      `/apis/rbac.authorization.k8s.io/v1/clusterroles/${this.name}`,
    );
    console.log(`🗑️ ClusterRole ${this.name} deleted`);
  }
}

export interface ClusterRoleBindingProps {
  roleRef: {
    apiGroup: string;
    kind: string;
    name: string;
  };
  subjects: Array<{
    kind: string;
    name: string;
    namespace?: string;
  }>;
  labels?: Record<string, string>;
}

export class ClusterRoleBinding extends BaseResource {
  name: string;

  constructor(name: string) {
    super(name);
    this.name = name;
  }

  async refresh() {
    const api = new K3sApi();
    try {
      const result = await api.get(
        `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${this.name}`,
      );
      return { exists: true, resource: result };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  async create(props: ClusterRoleBindingProps) {
    const api = new K3sApi();

    const manifest = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        name: this.name,
        labels: props.labels,
      },
      roleRef: props.roleRef,
      subjects: props.subjects,
    };

    await api.post(
      "/apis/rbac.authorization.k8s.io/v1/clusterrolebindings",
      manifest,
    );
    console.log(`✅ ClusterRoleBinding ${this.name} created`);
  }

  async update(props: ClusterRoleBindingProps) {
    // ClusterRoleBindings are immutable (roleRef cannot be changed)
    // If you need to change it, delete and recreate
    console.log(
      `ClusterRoleBinding ${this.name} is immutable, skipping update`,
    );
  }

  async delete() {
    const api = new K3sApi();
    await api.delete(
      `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${this.name}`,
    );
    console.log(`🗑️ ClusterRoleBinding ${this.name} deleted`);
  }
}

export function K3sClusterRole(name: string, props: ClusterRoleProps) {
  return alchemy.resource(new ClusterRole(name, props));
}

export function K3sClusterRoleBinding(
  name: string,
  props: ClusterRoleBindingProps,
) {
  return alchemy.resource(new ClusterRoleBinding(name, props));
}
}
