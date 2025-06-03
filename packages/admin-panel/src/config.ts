type Config = {
  appEnv: string;
  apiUrl: string;
  ghAppName: string;
};

const productionConfig: Config = {
  appEnv: "production",
  apiUrl: "https://api.origan.dev",
  ghAppName: "OriganEu",
};
const developmentConfig: Config = {
  appEnv: "development",
  apiUrl: "http://localhost:3000",
  ghAppName: "OriganEu-local",
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
