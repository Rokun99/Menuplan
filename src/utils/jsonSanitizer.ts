// Shared JSON sanitization helpers for rare fallback cases on the client.

export function cleanJsonResponse(text: string): string {
  let t = text;
  t = t.replace(/^```(?:json)?/gi, "").replace(/```$/g, "");
  t = t.replace(/^\s*Output:\s*/i, "");
  const first = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = -1;
  if (first >= 0 && firstArr >= 0) start = Math.min(first, firstArr);
  else start = Math.max(first, firstArr);
  if (start > 0) t = t.slice(start);
  t = t.replace(/,\s*([}\]])/g, "$1");
  return t.trim();
}

export function attemptJsonFix(raw: string): string | null {
  let t = raw.trim();

  if (!t.startsWith("{") && !t.startsWith("[")) {
    const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (lines.length > 1) {
      const arr = JSON.stringify(lines);
      return JSON.stringify({ suggestions: JSON.parse(arr) });
    }
  }

  const openCurly = (t.match(/{/g) || []).length;
  const closeCurly = (t.match(/}/g) || []).length;
  const openSquare = (t.match(/\[/g) || []).length;
  const closeSquare = (t.match(/\]/g) || []).length;
  if (openCurly > closeCurly) t = t + "}".repeat(openCurly - closeCurly);
  if (openSquare > closeSquare) t = t + "]".repeat(openSquare - closeSquare);

  t = t.replace(/,\s*([}\]])/g, "$1");

  try {
    JSON.parse(t);
    return t;
  } catch {
    return null;
  }
}