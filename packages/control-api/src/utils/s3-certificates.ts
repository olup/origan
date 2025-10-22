import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface CertificateData {
  privateKey: string;
  certificate: string;
  chain?: string;
}

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
    } catch (_error) {
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
  } catch (_error) {
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
