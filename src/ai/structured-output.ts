/** Explicit schemas are opt-in. json_object remains the existing prompt-only mode. */
export function explicitOutputSchema(format?: Record<string, unknown>): { name: string; schema: Record<string, unknown>; strict: true } | undefined {
  if (format?.type !== "json_schema") return undefined;
  const spec = format.json_schema as Record<string, unknown> | undefined;
  const schema = spec?.schema;
  if (!spec || typeof spec.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(spec.name)
    || !schema || typeof schema !== "object" || Array.isArray(schema)
    || (schema as Record<string, unknown>).type !== "object"
    || (spec.strict !== undefined && spec.strict !== true)) {
    throw new Error("Structured output requires a named strict object JSON schema.");
  }
  return { name: spec.name, schema: schema as Record<string, unknown>, strict: true };
}

/** Reject duplicate keys before a structured result is reserialized. No repairs. */
export function parseUniqueJson(json: string): unknown {
  const value: unknown = JSON.parse(json);
  let i = 0;
  const ws = () => { while (i < json.length && /\s/.test(json[i])) i++; };
  const string = (): string => {
    const start = i++;
    while (i < json.length) {
      const c = json[i++];
      if (c === "\\") i++;
      else if (c === '"') break;
    }
    return JSON.parse(json.slice(start, i)) as string;
  };
  const visit = (depth: number): void => {
    if (depth > 128) throw new Error("Structured JSON nesting exceeds 128.");
    ws();
    if (json[i] === "{") {
      i++; ws(); const seen = new Set<string>();
      if (json[i] === "}") { i++; return; }
      while (i < json.length) {
        ws(); const key = string();
        if (seen.has(key)) throw new Error("Duplicate structured JSON key.");
        seen.add(key); ws(); i++; visit(depth + 1); ws();
        if (json[i++] === "}") break;
      }
    } else if (json[i] === "[") {
      i++; ws(); if (json[i] === "]") { i++; return; }
      while (i < json.length) { visit(depth + 1); ws(); if (json[i++] === "]") break; }
    } else if (json[i] === '"') string();
    else while (i < json.length && !/[\s,}\]]/.test(json[i])) i++;
  };
  visit(0);
  return value;
}
