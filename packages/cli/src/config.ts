import "dotenv/config";

const origanProductionUrl = "https://api.origan.dev";

export const config = {
  apiUrl: process.env.ORIGAN_API_URL ?? origanProductionUrl,
};
