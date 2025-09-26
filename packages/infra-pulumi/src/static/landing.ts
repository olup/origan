import * as pulumi from "@pulumi/pulumi";
import { landingUrl } from "../config.js";

// For now, we just export the URL
// The actual serving will be configured separately
export const landingPageUrl = pulumi.interpolate`https://${landingUrl}`;