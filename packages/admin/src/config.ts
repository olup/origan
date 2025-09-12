type Config = {
  appEnv: string;
  apiUrl: string;
  ghAppName: string;
  useProxy?: boolean;
};

const productionConfig: Config = {
  appEnv: "production",
  apiUrl: "https://api.origan.dev",
  ghAppName: "OriganEu",
};

const developmentConfig: Config = {
  appEnv: "development",
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:9999",
  ghAppName: "OriganEu-local",
  useProxy: import.meta.env.VITE_USE_PROXY === "true",
};

export const getConfig = (): Config => {
  const appEnv = import.meta.env.VITE_APP_ENV;

  if (!appEnv) {
    throw new Error(
      "VITE_APP_ENV is not defined in the environment variables.",
    );
  }

  if (appEnv === "production") return productionConfig;
  if (appEnv === "development") return developmentConfig;

  throw new Error("VITE_APP_ENV must be either 'development' or 'production'.");
};
