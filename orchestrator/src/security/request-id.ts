import { randomUUID } from "node:crypto";

export function requestId(): string {
  return randomUUID();
}
