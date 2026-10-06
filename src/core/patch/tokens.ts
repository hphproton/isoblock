import { IsoblockError } from "../errors";

/**
 * Split a command line into tokens. Spaces separate tokens; double quotes group text that
 * contains spaces (`note="two words"` is the token `note=two words`). Inside quotes, `\"` is a
 * quote and `\\` is a backslash. A quoted empty string is an empty token.
 */
export function tokenize(line: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quoted) {
      const next = line[i + 1];
      if (c === "\\" && (next === '"' || next === "\\")) {
        current += next;
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      quoted = true;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
    } else {
      current += c;
      started = true;
    }
  }
  if (quoted) throw new IsoblockError("E_PATCH", "a double quote is not closed");
  if (started) tokens.push(current);
  return tokens;
}
