export interface RouteConfig {
  urlPath: string;
  functionPath: string;
}

export interface Config {
  app: string[];
  api: RouteConfig[];
  domain_placeholder?: string;
}
