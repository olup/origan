export type ResourceKind = "static" | "dynamic";

export interface ResourceConfig {
  kind: ResourceKind;
  urlPath: string;
  resourcePath: string;
  methods?: string[];
  headers?: Record<string, string>;
  wildcard?: boolean;
}

export interface Config {
  version: number;
  resources: ResourceConfig[];
  domain_placeholder?: string;
}
