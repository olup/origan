import fs from "node:fs/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { envConfig } from "../config/index.js";

export interface CertificateData {
  privateKey: string;
  certificate: string;
  chain?: string;
}

export const loadMainCertificateFromFiles =
  async (): Promise<CertificateData | null> => {
    try {
      const [certificate, privateKey] = await Promise.all([
        fs.readFile(envConfig.tlsCertFile, "utf-8"),
        fs.readFile(envConfig.tlsKeyFile, "utf-8"),
      ]);

      console.log("Loaded main certificate and private key from files");

      // The certificate file from cert-manager includes the chain
      // We need to split it to get the certificate and chain separately
      const certParts = certificate.split(/(?=-----BEGIN CERTIFICATE-----)/);

      return {
        certificate: certParts[0],
        privateKey,
        chain: certParts.slice(1).join(""), // Join remaining parts as chain
      };
    } catch (error) {
      console.error("Failed to load main certificate from files:", error);
      return null;
    }
  };

const getKeyPrefix = (domain: string): string => `certificates/${domain}`;

export const storeCertificate = async (
  s3Client: S3Client,
  bucketName: string,
  domain: string,
  data: CertificateData,
): Promise<void> => {
  const keyPrefix = getKeyPrefix(domain);

  // Store private key
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${keyPrefix}/private-key.pem`,
      Body: data.privateKey,
      ContentType: "application/x-pem-file",
    }),
  );

  // Store certificate
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${keyPrefix}/certificate.pem`,
      Body: data.certificate,
      ContentType: "application/x-pem-file",
    }),
  );

  // Store chain if provided
  if (data.chain) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${keyPrefix}/chain.pem`,
        Body: data.chain,
        ContentType: "application/x-pem-file",
      }),
    );
  }
};

export const getCertificate = async (
  s3Client: S3Client,
  bucketName: string,
  domain: string,
): Promise<CertificateData | null> => {
  const keyPrefix = getKeyPrefix(domain);

  try {
    // Get private key
    const privateKeyResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `${keyPrefix}/private-key.pem`,
      }),
    );
    const privateKey =
      (await privateKeyResponse.Body?.transformToString()) || "";

    // Get certificate
    const certificateResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `${keyPrefix}/certificate.pem`,
      }),
    );
    const certificate =
      (await certificateResponse.Body?.transformToString()) || "";

    // Try to get chain
    let chain: string | undefined;
    try {
      const chainResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: `${keyPrefix}/chain.pem`,
        }),
      );
      chain = await chainResponse.Body?.transformToString();
    } catch (error) {
      // Chain is optional, ignore error if not found
    }

    if (!privateKey || !certificate) {
      return null;
    }

    return {
      privateKey,
      certificate,
      chain,
    };
  } catch (error) {
    return null;
  }
};

export const deleteCertificate = async (
  s3Client: S3Client,
  bucketName: string,
  domain: string,
): Promise<void> => {
  const keyPrefix = getKeyPrefix(domain);

  // Delete all certificate files
  await Promise.all([
    s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `${keyPrefix}/private-key.pem`,
      }),
    ),
    s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `${keyPrefix}/certificate.pem`,
      }),
    ),
    s3Client
      .send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: `${keyPrefix}/chain.pem`,
        }),
      )
      .catch(() => {}), // Ignore error if chain doesn't exist
  ]);
};
