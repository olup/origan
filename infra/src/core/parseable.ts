import * as pulumi from "@pulumi/pulumi";

// Use existing Parseable instance from platform namespace
// No need to deploy our own since platform already has it
export const parseableServiceName = "parseable";
export const parseableEndpoint = "http://parseable.platform.svc.cluster.local:8000";
export const parseableIngestEndpoint = pulumi.output("http://parseable.platform.svc.cluster.local:8000/api/v1/ingest");
export const parseableUrl = "https://logs.platform.origan.dev"; // Assuming it's exposed here

// These would need to be configured based on the platform's Parseable instance
export const parseableUsername = "admin";
export const parseablePasswordValue = pulumi.output("admin123"); // Password from platform Parseable