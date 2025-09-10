import { type Context, Resource } from "alchemy";
import { K3sApi } from "./api.js";

/**
 * Properties for creating a ClusterRole
 */
export interface ClusterRoleProps {
  /**
   * Rules defining permissions
   */
  rules: Array<{
    apiGroups: string[];
    resources: string[];
    verbs: string[];
  }>;

  /**
   * Labels to apply to the ClusterRole
   */
  labels?: Record<string, string>;
}

/**
 * Kubernetes ClusterRole resource
 */
export interface ClusterRole
  extends Resource<"k3s::ClusterRole">,
    ClusterRoleProps {
  /**
   * ClusterRole name
   */
  name: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Create a Kubernetes ClusterRole
 *
 * @example
 * const role = await K3sClusterRole("my-role", {
 *   rules: [{
 *     apiGroups: [""],
 *     resources: ["pods"],
 *     verbs: ["get", "list", "watch"]
 *   }]
 * });
 */
export const K3sClusterRole = Resource(
  "k3s::ClusterRole",
  async function (
    this: Context<ClusterRole>,
    name: string,
    props: ClusterRoleProps,
  ): Promise<ClusterRole> {
    const api = new K3sApi();

    if (this.phase === "delete") {
      try {
        await api.delete("clusterrole", name);
      } catch (error) {
        console.error("Error deleting ClusterRole:", error);
      }
      return this.destroy();
    }

    // Check if ClusterRole already exists
    try {
      const _existing = await api.kubectl(`get clusterrole ${name}`);
      console.log(`ClusterRole ${name} already exists`);
      return this({
        name,
        rules: props.rules,
        labels: props.labels,
        createdAt: Date.now(),
      });
    } catch (_error: any) {
      // ClusterRole doesn't exist, create it
    }

    // Create ClusterRole
    const manifest = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: {
        name,
        labels: props.labels,
      },
      rules: props.rules,
    };

    await api.apply(manifest);
    console.log(`✅ ClusterRole ${name} created`);

    return this({
      name,
      rules: props.rules,
      labels: props.labels,
      createdAt: Date.now(),
    });
  },
);

/**
 * Properties for creating a ClusterRoleBinding
 */
export interface ClusterRoleBindingProps {
  /**
   * Reference to the ClusterRole
   */
  roleRef: {
    apiGroup: string;
    kind: string;
    name: string;
  };

  /**
   * Subjects to bind to the role
   */
  subjects: Array<{
    kind: string;
    name: string;
    namespace?: string;
  }>;

  /**
   * Labels to apply to the ClusterRoleBinding
   */
  labels?: Record<string, string>;
}

/**
 * Kubernetes ClusterRoleBinding resource
 */
export interface ClusterRoleBinding
  extends Resource<"k3s::ClusterRoleBinding">,
    ClusterRoleBindingProps {
  /**
   * ClusterRoleBinding name
   */
  name: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Create a Kubernetes ClusterRoleBinding
 *
 * @example
 * const binding = await K3sClusterRoleBinding("my-binding", {
 *   roleRef: {
 *     apiGroup: "rbac.authorization.k8s.io",
 *     kind: "ClusterRole",
 *     name: "my-role"
 *   },
 *   subjects: [{
 *     kind: "ServiceAccount",
 *     name: "my-sa",
 *     namespace: "default"
 *   }]
 * });
 */
export const K3sClusterRoleBinding = Resource(
  "k3s::ClusterRoleBinding",
  async function (
    this: Context<ClusterRoleBinding>,
    name: string,
    props: ClusterRoleBindingProps,
  ): Promise<ClusterRoleBinding> {
    const api = new K3sApi();

    if (this.phase === "delete") {
      try {
        await api.delete("clusterrolebinding", name);
      } catch (error) {
        console.error("Error deleting ClusterRoleBinding:", error);
      }
      return this.destroy();
    }

    // Check if ClusterRoleBinding already exists
    try {
      const _existing = await api.kubectl(`get clusterrolebinding ${name}`);
      console.log(`ClusterRoleBinding ${name} already exists`);
      return this({
        name,
        roleRef: props.roleRef,
        subjects: props.subjects,
        labels: props.labels,
        createdAt: Date.now(),
      });
    } catch (_error: any) {
      // ClusterRoleBinding doesn't exist, create it
    }

    // Create ClusterRoleBinding
    const manifest = {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        name,
        labels: props.labels,
      },
      roleRef: props.roleRef,
      subjects: props.subjects,
    };

    await api.apply(manifest);
    console.log(`✅ ClusterRoleBinding ${name} created`);

    return this({
      name,
      roleRef: props.roleRef,
      subjects: props.subjects,
      labels: props.labels,
      createdAt: Date.now(),
    });
  },
);
