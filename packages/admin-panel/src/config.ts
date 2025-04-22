type Config = {
  appEnv: string;
  apiUrl: string;
};

const productionConfig: Config = {
  appEnv: "production",
  apiUrl: "https://api.origna.dev",
};
const developmentConfig: Config = {
  appEnv: "development",
  apiUrl: "http://localhost:3000",
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
