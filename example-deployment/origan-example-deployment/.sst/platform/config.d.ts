import "./src/global.d.ts"
import "../types.generated"
import { AppInput, App, Config } from "./src/config"
import * as _scaleway from "@pulumiverse/scaleway";


declare global {
  // @ts-expect-error
  export import scaleway = _scaleway
  interface Providers {
    providers?: {
      "scaleway"?:  (_scaleway.ProviderArgs & { version?: string }) | boolean | string;
    }
  }
  export const $config: (
    input: Omit<Config, "app"> & {
      app(input: AppInput): Omit<App, "providers"> & Providers;
    },
  ) => Config;
}
