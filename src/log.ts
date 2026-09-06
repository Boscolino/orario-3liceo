// Log leggibile con timestamp locale [HH:MM:SS].

import { config } from "./config.ts";

function stamp(): string {
  const now = new Date();
  const s = now.toLocaleTimeString("it-IT", {
    hour12: false,
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `[${s}]`;
}

export const log = {
  info(msg: string): void {
    console.log(`${stamp()} ${msg}`);
  },
  step(msg: string): void {
    console.log(`${stamp()} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${stamp()} ⚠️  ${msg}`);
  },
  error(msg: string): void {
    console.error(`${stamp()} ❌ ${msg}`);
  },
  blank(): void {
    console.log("");
  },
};
