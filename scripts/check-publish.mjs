#!/usr/bin/env node
// Publication check (SPEC section 20): what a branch would publish follows the content rules,
// whichever agent or person made it.
//
//   node scripts/check-publish.mjs [--base <ref>] [--branch <name>] [--title <text>] [--body-file <file>]
//
// - Every commit of the branch that is not on the base (default `origin/main`, else `main`):
//   author and committer use no-reply addresses; the message has no URL, no link to an agent
//   session, no line that names a session or task, no address that is not a no-reply address,
//   and at most one `Co-Authored-By:` line.
// - Every line the branch adds to a text file: no link to an agent session, task, run or chat,
//   and no email address that is not a no-reply address.
// - The branch name (`--branch`, else the current branch): `builder/<topic>` or `maintainer/<topic>`.
// - With --title and --body-file: a pull request's title and description, as added lines.
// Exit 0 when nothing is found, 1 with a list of findings, 2 on a usage or git error.
// Maintained by the maintainer; builders run it and do not edit it.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Links to an agent's session, task, run or chat, with or without a scheme. Generic product links pass. */
export const SESSION_LINKS = [
  /claude\.ai\/(?:code\/)?sessions?[/_]/i,
  /claude\.ai\/(?:chat|share|project)\//i,
  /chatgpt\.com\/(?:c|g|share|codex|s)\//i,
  /chat\.openai\.com\/(?:c|share)\//i,
  /jules\.google(?:\.com)?\/(?:sessions?|tasks?)\//i,
  /gemini\.google\.com\/(?:app|share|gem)\//i,
  /aistudio\.google\.com\/(?:app\/)?prompts\//i,
  /cursor\.com\/(?:agents|background-agent|bc)\b/i,
  /devin\.ai\/sessions?\//i,
  /ampcode\.com\/threads?\//i,
  /\/agent-sessions?\//i,
  /\bsession_[A-Za-z0-9]{12,}\b/,
  /\btask_e_[0-9a-f]{8,}\b/i,
];

/** A line that names a session or task, as some environments append to commit messages. */
const SESSION_LINE = /^\s*(?:[A-Za-z][\w]*[- ])?(?:session|task|run|chat|conversation|thread)(?:[- ]?(?:id|url|link))?\s*:/i;
const URL = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]/i;
/** Email addresses; the top-level domain must be letters, so `pkg@1.2.3` is not one. */
const EMAIL = /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
const CO_AUTHOR = /^\s*co-authored-by\s*:/i;
const BRANCH = /^(?:builder|maintainer)\/[a-z0-9][a-z0-9._-]*$/;

/** No-reply: the local part is `noreply` or `no-reply` (a `+tag` allowed), or the domain is a no-reply or reserved one. */
export function isNoReply(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  if (/^no-?reply(?:\+[^@]*)?$/.test(local)) return true;
  if (/(?:^|\.)no-?reply(?:\.|$)/.test(domain)) return true;
  return /(?:^|\.)(?:example\.(?:com|org|net)|[a-z0-9-]+\.(?:invalid|example|test))$|^(?:invalid|example|test)$/.test(domain);
}

/** Addresses that are not personal: an SSH remote such as `git@github.com`. */
function isServiceAddress(email) {
  return /^git@/i.test(email);
}

/** Findings for one line of text that would be published: an added line, a title, a description or message line. */
export function textFindings(where, line) {
  const out = [];
  if (SESSION_LINKS.some((re) => re.test(line))) out.push(`${where}: link to an agent session, task, run or chat`);
  for (const email of line.match(EMAIL) ?? []) {
    if (!isNoReply(email) && !isServiceAddress(email)) out.push(`${where}: email address that is not a no-reply address`);
  }
  return out;
}

/** Findings for one commit: `{ sha, author, committer, message }`. */
export function commitFindings(c) {
  const out = [];
  const at = `commit ${c.sha.slice(0, 7)}`;
  for (const [role, email] of [["author", c.author], ["committer", c.committer]]) {
    if (!isNoReply(email)) out.push(`${at}: ${role} email is not a no-reply address`);
  }
  const lines = c.message.replace(/\s+$/, "").split("\n");
  lines.forEach((line, i) => {
    const where = `${at} message line ${i + 1}`;
    if (URL.test(line)) out.push(`${where}: URL`);
    if (SESSION_LINE.test(line)) out.push(`${where}: names a session or task`);
    out.push(...textFindings(where, line));
  });
  if (lines.filter((l) => CO_AUTHOR.test(l)).length > 1) out.push(`${at}: more than one Co-Authored-By line`);
  return out;
}

/**
 * Added lines of one file from `git diff --unified=0` output for that file alone: `[{ line, text }]`.
 * Header lines come before the first hunk; inside hunks every `+` line is content, even `+++`.
 */
export function addedLines(diff) {
  const out = [];
  let inHunk = false;
  let line = 0;
  for (const raw of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      inHunk = true;
      line = Number(hunk[1]);
      continue;
    }
    if (inHunk && raw.startsWith("+")) {
      out.push({ line, text: raw.slice(1) });
      line += 1;
    }
  }
  return out;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}

function resolveBase(given) {
  for (const ref of given ? [given] : ["origin/main", "main"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return ref;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(given ? `base ${given} not found` : "neither origin/main nor main exists");
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--base", "--branch", "--title", "--body-file"].includes(key) || value === undefined) {
      throw new Error("usage: check-publish.mjs [--base <ref>] [--branch <name>] [--title <text>] [--body-file <file>]");
    }
    opts[key.slice(2)] = value;
  }
  return opts;
}

/** Files the branch adds or changes, without the two that hold the patterns on purpose. */
const EXEMPT = new Set(["scripts/check-publish.mjs", "tests/repo/checkPublish.test.ts"]);

function run(opts) {
  const base = resolveBase(opts.base);
  const findings = [];
  const branch = opts.branch ?? git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "HEAD" && !BRANCH.test(branch)) findings.push(`branch "${branch}": name it builder/<topic> or maintainer/<topic>`);
  const shas = git(["rev-list", `${base}..HEAD`]).split("\n").filter(Boolean);
  for (const sha of shas) {
    const [author, committer, message] = git(["log", "-1", "--format=%ae%x00%ce%x00%B", sha]).split("\0");
    findings.push(...commitFindings({ sha, author, committer, message }));
  }
  let added = 0;
  if (shas.length > 0) {
    const files = git(["diff", "--name-only", "--diff-filter=AMR", "--no-renames", `${base}...HEAD`]).split("\n").filter(Boolean);
    for (const file of files.filter((f) => !EXEMPT.has(f))) {
      const diff = git(["diff", "--unified=0", "--no-color", "--no-ext-diff", "--text", `${base}...HEAD`, "--", file]);
      if (/^Binary files /m.test(diff)) continue;
      for (const a of addedLines(diff)) {
        added += 1;
        findings.push(...textFindings(`${file}:${a.line}`, a.text));
      }
    }
  }
  if (opts.title !== undefined) findings.push(...textFindings("pull request title", opts.title));
  if (opts["body-file"] !== undefined) {
    readFileSync(opts["body-file"], "utf8")
      .split("\n")
      .forEach((line, i) => findings.push(...textFindings(`pull request description line ${i + 1}`, line)));
  }
  return { scope: `${shas.length} commits and ${added} added lines since ${base}`, findings };
}

function main() {
  let result;
  try {
    result = run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    return 2;
  }
  const { scope, findings } = result;
  if (findings.length === 0) {
    console.log(`publish check: ${scope}, nothing found`);
    return 0;
  }
  console.log(`publish check: ${scope}, ${findings.length} findings`);
  for (const f of findings) console.log(`  ${f}`);
  console.log("Fix them before the first push: rewrite the commits, remove the lines (SPEC section 20).");
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exit(main());
