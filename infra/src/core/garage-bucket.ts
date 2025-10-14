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
      async create(inputs: any) {
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
        } catch (error: any) {
          // If bucket already exists, that's OK
          if (
            error.name === "BucketAlreadyOwnedByYou" ||
            error.name === "BucketAlreadyExists"
          ) {
            // Silently continue - bucket exists
          } else {
            throw new Error(`Failed to create bucket: ${error.message}`);
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

      async update(id: string, olds: any, news: any) {
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

      async delete(id: string, props: any) {
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
              await s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: props.bucketName,
                  Delete: {
                    Objects: objects.Contents.map((obj) => ({ Key: obj.Key! })),
                  },
                }),
              );
            }
          }

          // Delete the bucket
          await s3Client.send(
            new DeleteBucketCommand({
              Bucket: props.bucketName,
            }),
          );
        } catch (error: any) {
          // Silently fail on delete - bucket might not exist
        }
      },

      async diff(id: string, olds: any, news: any) {
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
