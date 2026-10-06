import { IsoblockError, withPrefix } from "../errors";
import { parseCommand, type Command } from "./commands";
import { parseJsonPatch, type JsonOp } from "./jsonPatch";
import { tokenize } from "./tokens";

/** A patch file after parsing (SPEC section 12). Nothing has been applied yet. */
export type ParsedPatch =
  | { readonly kind: "json"; readonly description: null; readonly ops: readonly JsonOp[] }
  | {
      readonly kind: "commands";
      readonly description: string | null;
      readonly commands: readonly { readonly line: number; readonly command: Command }[];
    };

/** True when the text is a scene file and not a patch: its first non-blank character is `{`. */
export function looksLikeScene(text: string): boolean {
  return text.replace(/^\ufeff/, "").trimStart().startsWith("{");
}

/**
 * Parse a patch file. A file whose first non-blank character is `[` is a JSON Patch; any other
 * file is short commands, one per line, with `#` comments; the first comment line is the
 * description. Throws `E_PATCH`, or `E_USAGE` for a command of a later stage.
 */
export function parsePatch(text: string): ParsedPatch {
  const body = text.replace(/^\ufeff/, "");
  if (body.trimStart().startsWith("[")) return { kind: "json", description: null, ops: parseJsonPatch(body) };
  let description: string | null = null;
  let seenComment = false;
  const commands: { line: number; command: Command }[] = [];
  body.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "") return;
    if (line.startsWith("#")) {
      if (!seenComment) description = line.slice(1).trim() || null;
      seenComment = true;
      return;
    }
    try {
      commands.push({ line: i + 1, command: parseCommand(tokenize(line)) });
    } catch (e) {
      if (e instanceof IsoblockError) throw withPrefix(e, `line ${i + 1}`);
      throw e;
    }
  });
  return { kind: "commands", description, commands };
}
