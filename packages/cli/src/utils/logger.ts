import pc from "picocolors";

type PicoColor = {
  [K in keyof typeof pc]: (typeof pc)[K] extends (str: string) => string
    ? K
    : never;
}[keyof typeof pc];

export const log = {
  error(...messages: string[]) {
    console.error(pc.yellow(messages.join(" "))); // picocolors doesn't support hex, using yellow for orange
  },
  success(...messages: string[]) {
    console.log(pc.green(messages.join(" ")));
  },
  info(...messages: string[]) {
    console.log(pc.green(messages.join(" ")));
  },
  debug(...messages: string[]) {
    console.log(pc.dim(messages.join(" ")));
  },
  color(color: PicoColor, ...messages: string[]) {
    console.log(pc[color](messages.join(" ")));
  },
};
