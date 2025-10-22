import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface ChallengeData {
  token: string;
  keyAuthorization: string;
  expires: Date;
}

const getChallengeKey = (token: string): string => `challenges/${token}`;

export const storeChallenge = async (
  s3Client: S3Client,
  bucketName: string,
  data: ChallengeData,
): Promise<void> => {
  const key = getChallengeKey(data.token);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify({
        keyAuthorization: data.keyAuthorization,
        expires: data.expires.toISOString(),
      }),
      ContentType: "application/json",
    }),
  );
};

export const getChallenge = async (
  s3Client: S3Client,
  bucketName: string,
  token: string,
): Promise<ChallengeData | null> => {
  const key = getChallengeKey(token);

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    const content = await response.Body?.transformToString();
    if (!content) {
      return null;
    }

    const data = JSON.parse(content);
    const expires = new Date(data.expires);

    // Return null if challenge has expired
    if (expires < new Date()) {
      await deleteChallenge(s3Client, bucketName, token);
      return null;
    }

    return {
      token,
      keyAuthorization: data.keyAuthorization,
      expires,
    };
  } catch (_error) {
    return null;
  }
};

export const deleteChallenge = async (
  s3Client: S3Client,
  bucketName: string,
  token: string,
): Promise<void> => {
  const key = getChallengeKey(token);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
};
