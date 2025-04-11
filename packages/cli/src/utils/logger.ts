import pc from "picocolors";

export const log = {
  error(message: string) {
    console.error(pc.yellow(message)); // picocolors doesn't support hex, using yellow for orange
  },
  success(message: string) {
    console.log(pc.green(message));
  },
  info(message: string) {
    console.log(message);
  },
  debug(message: string) {
    console.log(pc.dim(message));
  },
};
