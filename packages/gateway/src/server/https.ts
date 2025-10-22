import type { RequestListener } from "node:http";
import { createServer } from "node:https";
import type { SecureContextOptions, SecureVersion } from "node:tls";
import { createSecureContext } from "node:tls";
import { envConfig } from "../config/index.js";
import {
  getCertificate,
  loadMainCertificateFromFiles,
} from "../services/certificates.js";
import { s3Client } from "../utils/s3.js";

// Load the main wildcard certificate
let mainSecureContext: ReturnType<typeof createSecureContext> | undefined;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const initializeMainCertificate = async (
  retryCount = 0,
  maxRetries = 10,
  initialDelay = 1000,
): Promise<void> => {
  try {
    const mainCert = await loadMainCertificateFromFiles();
    if (!mainCert) {
      throw new Error("Failed to load main certificate");
    }

    mainSecureContext = createSecureContext({
      ...baseTlsConfig,
      cert: mainCert.certificate,
      key: mainCert.privateKey,
      ca: mainCert.chain,
    });

    return;
  } catch (error) {
    console.error("Error loading main wildcard certificate:", error);

    if (retryCount < maxRetries) {
      const nextDelay = initialDelay * 2 ** retryCount;
      console.log(
        `Retrying certificate load in ${nextDelay}ms (attempt ${
          retryCount + 1
        }/${maxRetries})`,
      );
      await delay(nextDelay);
      return initializeMainCertificate(
        retryCount + 1,
        maxRetries,
        initialDelay,
      );
    }

    throw new Error(
      `Failed to load main certificate after ${maxRetries} retries`,
    );
  }
};

interface TlsConfig extends SecureContextOptions {
  minVersion: SecureVersion;
  ciphers: string;
}

// TLS base configuration without certificates
const baseTlsConfig: TlsConfig = {
  minVersion: "TLSv1.2" as SecureVersion,
  ciphers: [
    // Modern cipher suites for TLS 1.2 and 1.3
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
  ].join(":"),
};

// SNI callback to dynamically load certificates
const sniCallback = async (
  servername: string,
  cb: (err: Error | null, ctx?: ReturnType<typeof createSecureContext>) => void,
) => {
  try {
    const certData = await getCertificate(
      s3Client,
      envConfig.bucketName,
      servername,
    );
    if (!certData) {
      console.error(`No certificate found for domain: ${servername}`);
      return cb(new Error(`No certificate found for domain: ${servername}`));
    }

    const context = createSecureContext({
      ...baseTlsConfig,
      cert: certData.certificate,
      key: certData.privateKey,
      ca: certData.chain,
    });

    cb(null, context);
  } catch (error) {
    console.error(`Error loading certificate for ${servername}:`, error);
    cb(error as Error);
  }
};
export async function createHttpsServer(handler: RequestListener) {
  console.log("Creating HTTPS server...");
  // Initialize main certificate before starting the server
  await initializeMainCertificate();

  console.log("Main certificate initialized");

  const server = createServer(
    {
      ...baseTlsConfig,
      SNICallback: (servername, cb) => {
        // Use main certificate for default domain
        if (servername.endsWith(envConfig.origanDeployDomain)) {
          if (!mainSecureContext) {
            cb(new Error("Main certificate context not available"));
            return;
          }
          cb(null, mainSecureContext);
          return;
        }

        // Use regular SNI callback for other domains
        sniCallback(servername, cb);
      },
      // Set default certificate (will be used if SNI is not supported)
      ...(mainSecureContext && {
        cert: mainSecureContext.context.cert,
        key: mainSecureContext.context.key,
        ca: mainSecureContext.context.ca,
      }),
    },
    handler,
  );

  server.listen(7778, () => {
    console.log("HTTPS Server is running on port 7778");
  });

  return server;
}
