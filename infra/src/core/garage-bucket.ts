import * as pulumi from "@pulumi/pulumi";

export interface GarageBucketProps {
  bucketName: string;
  endpoint: string;
  accessKey: pulumi.Input<string>;
  secretKey: pulumi.Input<string>;
  region?: string;
  forceDestroy?: boolean;
  website?: {
    indexDocument: string;
    errorDocument?: string;
  };
}

interface GarageBucketInputs {
  bucketName: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  forceDestroy?: boolean;
  website?: {
    indexDocument: string;
    errorDocument?: string;
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorName(error: unknown): string | null {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

/**
 * Custom resource for creating S3 buckets in Garage
 * Only uses S3 operations that Garage actually supports
 */
export class GarageBucket extends pulumi.dynamic.Resource {
  public declare readonly bucket: pulumi.Output<string>;
  public declare readonly id: pulumi.Output<string>;
  public declare readonly arn: pulumi.Output<string>;

  constructor(
    name: string,
    props: GarageBucketProps,
    opts?: pulumi.CustomResourceOptions,
  ) {
    const provider: pulumi.dynamic.ResourceProvider = {
      async create(inputs: GarageBucketInputs) {
        // Dynamic import to avoid closure serialization issues
        const { S3Client, CreateBucketCommand, PutBucketWebsiteCommand } =
          await import("@aws-sdk/client-s3");

        const s3Client = new S3Client({
          endpoint: inputs.endpoint,
          region: inputs.region || "garage",
          credentials: {
            accessKeyId: inputs.accessKey,
            secretAccessKey: inputs.secretKey,
          },
          forcePathStyle: true,
        });

        try {
          // Create bucket
          await s3Client.send(
            new CreateBucketCommand({
              Bucket: inputs.bucketName,
            }),
          );

          // Configure website if requested
          if (inputs.website) {
            await s3Client.send(
              new PutBucketWebsiteCommand({
                Bucket: inputs.bucketName,
                WebsiteConfiguration: {
                  IndexDocument: {
                    Suffix: inputs.website.indexDocument,
                  },
                  ErrorDocument: inputs.website.errorDocument
                    ? {
                        Key: inputs.website.errorDocument,
                      }
                    : undefined,
                },
              }),
            );
          }
        } catch (error: unknown) {
          // If bucket already exists, that's OK
          const errorName = getErrorName(error);
          if (
            errorName === "BucketAlreadyOwnedByYou" ||
            errorName === "BucketAlreadyExists"
          ) {
            // Silently continue - bucket exists
          } else {
            throw new Error(
              `Failed to create bucket: ${getErrorMessage(error)}`,
            );
          }
        }

        return {
          id: inputs.bucketName,
          outs: {
            bucket: inputs.bucketName,
            id: inputs.bucketName,
            arn: `arn:aws:s3:::${inputs.bucketName}`,
          },
        };
      },

      async update(
        _id: string,
        olds: GarageBucketInputs,
        news: GarageBucketInputs,
      ) {
        // For updates, we only handle website configuration changes
        if (JSON.stringify(olds.website) !== JSON.stringify(news.website)) {
          const { S3Client, PutBucketWebsiteCommand } = await import(
            "@aws-sdk/client-s3"
          );

          const s3Client = new S3Client({
            endpoint: news.endpoint,
            region: news.region || "garage",
            credentials: {
              accessKeyId: news.accessKey,
              secretAccessKey: news.secretKey,
            },
            forcePathStyle: true,
          });

          if (news.website) {
            await s3Client.send(
              new PutBucketWebsiteCommand({
                Bucket: news.bucketName,
                WebsiteConfiguration: {
                  IndexDocument: {
                    Suffix: news.website.indexDocument,
                  },
                  ErrorDocument: news.website.errorDocument
                    ? {
                        Key: news.website.errorDocument,
                      }
                    : undefined,
                },
              }),
            );
          }
        }

        return {
          outs: {
            bucket: news.bucketName,
            id: news.bucketName,
            arn: `arn:aws:s3:::${news.bucketName}`,
          },
        };
      },

      async delete(_id: string, props: GarageBucketInputs) {
        const {
          S3Client,
          ListObjectsV2Command,
          DeleteObjectsCommand,
          DeleteBucketCommand,
        } = await import("@aws-sdk/client-s3");

        const s3Client = new S3Client({
          endpoint: props.endpoint,
          region: props.region || "garage",
          credentials: {
            accessKeyId: props.accessKey,
            secretAccessKey: props.secretKey,
          },
          forcePathStyle: true,
        });

        try {
          if (props.forceDestroy) {
            // First, try to empty the bucket
            const objects = await s3Client.send(
              new ListObjectsV2Command({
                Bucket: props.bucketName,
                MaxKeys: 1000,
              }),
            );

            if (objects.Contents && objects.Contents.length > 0) {
              const deleteTargets = objects.Contents.flatMap((obj) =>
                obj.Key ? [{ Key: obj.Key }] : [],
              );
              if (deleteTargets.length > 0) {
                await s3Client.send(
                  new DeleteObjectsCommand({
                    Bucket: props.bucketName,
                    Delete: {
                      Objects: deleteTargets,
                    },
                  }),
                );
              }
            }
          }

          // Delete the bucket
          await s3Client.send(
            new DeleteBucketCommand({
              Bucket: props.bucketName,
            }),
          );
        } catch (_error: unknown) {
          // Silently fail on delete - bucket might not exist
        }
      },

      async diff(
        _id: string,
        olds: GarageBucketInputs,
        news: GarageBucketInputs,
      ) {
        const changes =
          JSON.stringify(olds.website) !== JSON.stringify(news.website);
        return {
          changes,
          replaces: olds.bucketName !== news.bucketName ? ["bucketName"] : [],
          deleteBeforeReplace: true,
        };
      },
    };

    super(
      provider,
      name,
      {
        bucketName: props.bucketName,
        endpoint: props.endpoint,
        accessKey: props.accessKey,
        secretKey: props.secretKey,
        region: props.region,
        forceDestroy: props.forceDestroy,
        website: props.website,
        // placeholders so the dynamic provider can populate outputs later
        bucket: undefined,
        id: undefined,
        arn: undefined,
      },
      opts,
    );
  }
}
