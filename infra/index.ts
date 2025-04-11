import { deployAll } from "./src/index";
import { config } from "./src/config";

const outputs = deployAll();

// Export outputs to Pulumi stack
export const apiUrl = outputs.apiUrl;
export const bucketUrl = outputs.bucketUrl;
export const bucketName = outputs.bucketName;
export const bucketRegion = outputs.bucketRegion;
export const bucketAccessKey = outputs.bucketAccessKey;
export const bucketSecretKey = outputs.bucketSecretKey;
