export interface OriganNitroPresetOptions {
  outDir?: string;
  manifestFile?: string;
}

export function preset(options: OriganNitroPresetOptions = {}) {
  return {
    name: "origan",
    options,
  };
}
