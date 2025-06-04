import { deployAll } from "./src/index";

const outputs = deployAll();

// Export outputs to Pulumi stack
export const apiUrl = outputs.apiUrl;
export const adminPanelUrl = outputs.adminPanelUrl;
export const bucketUrl = outputs.bucketUrl;
export const bucketName = outputs.bucketName;
export const bucketRegion = outputs.bucketRegion;
export const bucketAccessKey = outputs.bucketAccessKey;
export const bucketSecretKey = outputs.bucketSecretKey;
export const databaseConnectionString = outputs.database.connectionString;
