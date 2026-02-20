const SENSITIVE_KEY_PATTERNS = [/secret/i, /token/i, /password/i, /api[-_]?key/i, /authorization/i];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (isObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactSensitive(val);
      }
    }
    return output;
  }

  return value;
}
