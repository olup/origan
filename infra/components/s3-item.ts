import * as pulumi from "@pulumi/pulumi";
import * as fs from "node:fs";
import * as mime from "mime-types";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { DiffResult } from "@pulumi/pulumi/dynamic";
import { objectWithoutUndefined } from "../utils";

interface S3ItemInputs {
  key: pulumi.Input<string>;
  bucket: pulumi.Input<string>;
  region: pulumi.Input<string>;
  file: pulumi.Input<string>;
  forceUpdate?: pulumi.Input<boolean>;
  hash?: pulumi.Input<string>;
  visibility?: pulumi.Input<string>;
  metadata?: pulumi.Input<{ [key: string]: string }>;
}

interface S3ItemArgs {
  key: string;
  bucket: string;
  region: string;
  file: string;
  forceUpdate?: boolean;
  hash?: string;
  visibility?: string;
  metadata?: { [key: string]: string };
}

interface S3ItemOutputs {
  key: string;
  bucket: string;
  file: string;
  hash?: string;
  visibility?: string;
  metadata?: { [key: string]: string };
}

class S3ItemProvider implements pulumi.dynamic.ResourceProvider {
  private accessKey = "";
  private secretKey = "";

  async configure(req: pulumi.dynamic.ConfigureRequest): Promise<void> {
    this.accessKey = req.config.require("scaleway:access_key");
    this.secretKey = req.config.require("scaleway:secret_key");
  }

  private client(region: string): S3Client {
    const endpoint = `https://s3.${region}.scw.cloud`;
    return new S3Client({
      endpoint: endpoint,
      region: region,
      credentials: {
        accessKeyId: this.accessKey,
        secretAccessKey: this.secretKey,
      },
    });
  }

  commandFromInputs(inputs: S3ItemArgs): PutObjectCommand {
    const contentType = mime.lookup(inputs.file) || "application/octet-stream";

    console.log(`Uploading ${inputs.file} to ${inputs.bucket}/${inputs.key}`);
    const body = fs.createReadStream(inputs.file);

    return new PutObjectCommand({
      Bucket: inputs.bucket,
      Key: inputs.key,
      Body: body,
      Metadata: inputs.metadata,
      ContentType: contentType,
    });
  }

  async create(
    inputs: S3ItemArgs,
  ): Promise<pulumi.dynamic.CreateResult<S3ItemOutputs>> {
    await this.client(inputs.region).send(this.commandFromInputs(inputs));

    const id = `${inputs.region}:${inputs.bucket}/${inputs.key}`;
    return {
      id: id,
      outs: objectWithoutUndefined({
        key: inputs.key,
        bucket: inputs.bucket,
        file: inputs.file,
        hash: inputs.hash,
        visibility: inputs.visibility,
        metadata: inputs.metadata,
      }),
    };
  }

  async update(
    id: string,
    olds: S3ItemArgs,
    news: S3ItemArgs,
  ): Promise<pulumi.dynamic.UpdateResult> {
    await this.client(news.region).send(this.commandFromInputs(news));

    return {};
  }

  async delete(id: string, props: S3ItemArgs): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: props.bucket,
      Key: props.key,
    });
    await this.client(props.region || "fr-par").send(command);
  }

  async diff(
    id: string,
    oldOutputs: S3ItemOutputs,
    newInputs: S3ItemArgs,
  ): Promise<DiffResult> {
    const changes = [];
    const replaces = [];
    if (oldOutputs.key !== newInputs.key) {
      replaces.push("key");
    }
    if (oldOutputs.bucket !== newInputs.bucket) {
      replaces.push("bucket");
    }
    if (oldOutputs.file !== newInputs.file) {
      changes.push("file");
    }
    if (oldOutputs.hash !== newInputs.hash) {
      changes.push("hash");
    }
    if (oldOutputs.visibility !== newInputs.visibility) {
      changes.push("visibility");
    }
    if (oldOutputs.metadata !== newInputs.metadata) {
      changes.push("metadata");
    }

    return {
      changes: changes.length + replaces.length > 0 || newInputs.forceUpdate,
      replaces: replaces,
    };
  }
}

export class S3Item extends pulumi.dynamic.Resource {
  constructor(name: string, args: S3ItemInputs, opts?: pulumi.ResourceOptions) {
    super(new S3ItemProvider(), name, args, opts);
  }
}
