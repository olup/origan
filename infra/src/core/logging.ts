import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "./namespace.js";
import { resourceName, labels } from "../config.js";
import { parseableIngestEndpoint, parseableUsername, parseablePasswordValue } from "./parseable.js";

// Create ServiceAccount for Fluent Bit
const fluentbitServiceAccount = new kubernetes.core.v1.ServiceAccount("fluentbit-sa", {
  metadata: {
    name: resourceName("fluentbit-sa"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "fluentbit",
    },
  },
}, { provider: k8sProvider });

// Create ClusterRole for Fluent Bit
const fluentbitClusterRole = new kubernetes.rbac.v1.ClusterRole("fluentbit-role", {
  metadata: {
    name: resourceName("fluentbit-role"),
    labels: {
      ...labels,
      component: "fluentbit",
    },
  },
  rules: [
    {
      apiGroups: [""],
      resources: ["pods", "namespaces"],
      verbs: ["get", "list", "watch"],
    },
  ],
}, { provider: k8sProvider });

// Create ClusterRoleBinding
const fluentbitClusterRoleBinding = new kubernetes.rbac.v1.ClusterRoleBinding("fluentbit-binding", {
  metadata: {
    name: resourceName("fluentbit-binding"),
    labels: {
      ...labels,
      component: "fluentbit",
    },
  },
  roleRef: {
    apiGroup: "rbac.authorization.k8s.io",
    kind: "ClusterRole",
    name: fluentbitClusterRole.metadata.name,
  },
  subjects: [{
    kind: "ServiceAccount",
    name: fluentbitServiceAccount.metadata.name,
    namespace: namespaceName_,
  }],
}, { provider: k8sProvider });

// Fluent Bit ConfigMap
const fluentbitConfig = new kubernetes.core.v1.ConfigMap("fluentbit-config", {
  metadata: {
    name: resourceName("fluentbit-config"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "fluentbit",
    },
  },
  data: {
    "fluent-bit.conf": pulumi.interpolate`
[SERVICE]
    Flush        5
    Daemon       off
    Log_Level    info
    Parsers_File parsers.conf

[INPUT]
    Name              tail
    Tag               kube.*
    Path              /var/log/containers/*.log
    Parser            docker
    DB                /var/log/flb_kube.db
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On
    Refresh_Interval  10

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Kube_Tag_Prefix     kube.var.log.containers.
    Merge_Log           On
    Keep_Log            Off
    K8S-Logging.Parser  On
    K8S-Logging.Exclude Off
    Annotations         On

[FILTER]
    Name    grep
    Match   kube.*
    Regex   kubernetes_annotations_origan.dev/collect-logs true

[OUTPUT]
    Name              http
    Match             kube.*
    Host              ${parseableIngestEndpoint.apply(e => e.replace('http://', '').replace('/api/v1/ingest', ''))}
    Port              80
    URI               /api/v1/ingest
    Format            json
    Header            X-P-Stream kubernetes
    Header            Authorization Basic ${pulumi.interpolate`${Buffer.from(`${parseableUsername}:${parseablePasswordValue}`).toString('base64')}`}
    tls               off
    Retry_Limit       5
`,
    "parsers.conf": `
[PARSER]
    Name        docker
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
    Time_Keep   On
    Decode_Field_As escaped_utf8 log

[PARSER]
    Name        syslog
    Format      regex
    Regex       ^\<(?<pri>[0-9]+)\>(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$
    Time_Key    time
    Time_Format %b %d %H:%M:%S
`,
  },
}, { provider: k8sProvider });

// Fluent Bit DaemonSet
const fluentbitDaemonSet = new kubernetes.apps.v1.DaemonSet("fluentbit", {
  metadata: {
    name: resourceName("fluentbit"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "fluentbit",
    },
  },
  spec: {
    selector: {
      matchLabels: {
        ...labels,
        component: "fluentbit",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          component: "fluentbit",
        },
        annotations: {
          "origan.dev/collect-logs": "false", // Don't collect logs from fluent-bit itself
        },
      },
      spec: {
        serviceAccountName: fluentbitServiceAccount.metadata.name,
        containers: [{
          name: "fluent-bit",
          image: "fluent/fluent-bit:2.1.8",
          imagePullPolicy: "Always",
          volumeMounts: [
            {
              name: "varlog",
              mountPath: "/var/log",
            },
            {
              name: "varlibdockercontainers",
              mountPath: "/var/lib/docker/containers",
              readOnly: true,
            },
            {
              name: "config",
              mountPath: "/fluent-bit/etc/",
            },
          ],
          resources: {
            requests: {
              memory: "100Mi",
              cpu: "50m",
            },
            limits: {
              memory: "200Mi",
              cpu: "100m",
            },
          },
        }],
        terminationGracePeriodSeconds: 10,
        volumes: [
          {
            name: "varlog",
            hostPath: {
              path: "/var/log",
            },
          },
          {
            name: "varlibdockercontainers",
            hostPath: {
              path: "/var/lib/docker/containers",
            },
          },
          {
            name: "config",
            configMap: {
              name: fluentbitConfig.metadata.name,
            },
          },
        ],
        tolerations: [
          {
            key: "node-role.kubernetes.io/master",
            effect: "NoSchedule",
          },
        ],
      },
    },
  },
}, { provider: k8sProvider });

// Exports
export const fluentbitDaemonSetName = fluentbitDaemonSet.metadata.name;
export const fluentbitServiceAccountName = fluentbitServiceAccount.metadata.name;