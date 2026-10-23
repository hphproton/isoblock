#!/usr/bin/env node
// Publication check (SPEC section 20): what a branch would publish follows the content rules,
// whichever agent or person made it.
//
//   node scripts/check-publish.mjs [--base <ref>] [--branch <name>] [--title <text>] [--body-file <file>]
//
// - Every commit of the branch that is not on the base (default `origin/main`, else `main`):
//   author and committer are a no-reply address or a listed agent identity, never a made-up one;
//   the subject and body follow the message rules; the trailers are only `Co-authored-by:` and
//   `Signed-off-by:`, one per address; the message has no URL, no session link or line, and no
//   other address.
// - Every line the branch adds to a text file: no link to an agent session, task, run or chat,
//   and no email address that is not a no-reply address.
// - The branch name (`--branch`, else the current branch): `builder/<topic>` or `maintainer/<topic>`.
//   A branch `builder/stage-<N>` builds the stage that `ROADMAP.md` on the base marks open, and starts
//   at or after the commit that opened it.
// - The remote branch `origin/<name>`, when git knows it: the branch contains it, so pushing needs
//   no force-push.
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
/** A trailer line: a key with at least one hyphen, a colon and a value (`Co-authored-by: ...`). */
const TRAILER = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+):\s+\S/;
const ALLOWED_TRAILERS = new Set(["co-authored-by", "signed-off-by"]);
const PREFIX = /^(?:[a-z]+(?:\([^)]*\))?!?:|\[[^\]]*\])\s/i;
const SUBJECT_MAX = 72;
const BODY_MAX = 72;

/**
 * The commit identities of agent environments, as the environment sets them up for its own agent.
 * The maintainer adds one when a new agent's identity is first seen (MAINTAINING.md, review step 17).
 */
export const AGENT_IDENTITIES = new Set(["cursoragent@cursor.com"]);
const BRANCH = /^(?:builder|maintainer)\/[a-z0-9][a-z0-9._-]*$/;
const STAGE_BRANCH = /^builder\/stage-(\d+)$/;

/** The number of the stage that a `ROADMAP.md` marks open (heading `## Stage <N>`, a middle dot, `open`), or null. */
export function openStage(roadmap) {
  const m = /^## Stage (\d+) \u00b7 open\b/m.exec(roadmap);
  return m === null ? null : Number(m[1]);
}

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

/** An address at a reserved domain: fine in text, never an identity. */
export function isReserved(email) {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return /(?:^|\.)(?:example\.(?:com|org|net)|[a-z0-9-]+\.(?:invalid|example|test))$|^(?:invalid|example|test)$/.test(domain);
}

/** An address that may be the author or committer of a commit. */
export function isIdentity(email) {
  return !isReserved(email) && (isNoReply(email) || AGENT_IDENTITIES.has(email.toLowerCase()));
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
    if (!isNoReply(email) && !isServiceAddress(email) && !AGENT_IDENTITIES.has(email.toLowerCase())) {
      out.push(`${where}: email address that is not a no-reply address or an agent identity`);
    }
  }
  return out;
}

/** Findings for one commit: `{ sha, author, committer, message }`. */
export function commitFindings(c) {
  const out = [];
  const at = `commit ${c.sha.slice(0, 7)}`;
  for (const [role, email] of [["author", c.author], ["committer", c.committer]]) {
    if (isReserved(email)) out.push(`${at}: ${role} email is a made-up address; commit with your environment's identity`);
    else if (!isIdentity(email)) out.push(`${at}: ${role} email is not a no-reply address or a known agent identity`);
  }
  const lines = c.message.replace(/\s+$/, "").split("\n");
  lines.forEach((line, i) => {
    const where = `${at} message line ${i + 1}`;
    if (URL.test(line)) out.push(`${where}: URL`);
    if (SESSION_LINE.test(line)) out.push(`${where}: names a session or task`);
    out.push(...textFindings(where, line));
  });
  out.push(...messageFindings(at, lines));
  return out;
}

/** The subject, body and trailer rules of SPEC section 20. */
export function messageFindings(at, lines) {
  const out = [];
  const subject = lines[0] ?? "";
  if (subject.trim() === "") return [`${at}: empty subject`];
  if (subject.length > SUBJECT_MAX) out.push(`${at}: subject longer than ${SUBJECT_MAX} characters`);
  if (/\.\s*$/.test(subject)) out.push(`${at}: subject ends with a period`);
  if (!/^[A-Z]/.test(subject)) out.push(`${at}: subject does not start with a capital letter`);
  if (PREFIX.test(subject)) out.push(`${at}: subject has a prefix`);
  if (lines.length > 1 && lines[1].trim() !== "") out.push(`${at}: no blank line after the subject`);
  const paragraphs = lines.slice(1).join("\n").trim().split(/\n\s*\n/).filter((p) => p.trim() !== "");
  const last = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].split("\n") : [];
  const trailers = last.length > 0 && last.every((l) => TRAILER.test(l)) ? last : [];
  const body = paragraphs.slice(0, trailers.length > 0 ? -1 : undefined).join("\n").split("\n");
  body.forEach((line) => {
    if (line.length > BODY_MAX && /\s/.test(line.trim())) out.push(`${at}: body line longer than ${BODY_MAX} characters`);
    if (/^#{1,6}\s/.test(line)) out.push(`${at}: Markdown heading in the body`);
    if (TRAILER.test(line) && ALLOWED_TRAILERS.has((TRAILER.exec(line)?.[1] ?? "").toLowerCase())) out.push(`${at}: trailer outside the last block`);
  });
  const seen = new Set();
  for (const line of trailers) {
    const key = (TRAILER.exec(line)?.[1] ?? "").toLowerCase();
    if (!ALLOWED_TRAILERS.has(key)) {
      out.push(`${at}: trailer "${key}" is not allowed`);
      continue;
    }
    const email = /<([^>]+)>\s*$/.exec(line)?.[1];
    if (email === undefined) out.push(`${at}: ${key} line without an address`);
    else if (!isIdentity(email)) out.push(`${at}: ${key} address is not a no-reply address or a known agent identity`);
    else if (seen.has(`${key} ${email.toLowerCase()}`)) out.push(`${at}: ${key} line repeated for one address`);
    else seen.add(`${key} ${email.toLowerCase()}`);
  }
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

/** The text of a file at a commit, or null when the commit has no such file. */
function fileAt(ref, path) {
  try {
    return git(["show", `${ref}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * A branch `builder/stage-<N>` builds the stage open on the base and starts after that stage was
 * opened: a session that starts from an outdated copy of the base finds out before it pushes.
 */
function stageFindings(branch, base) {
  const m = STAGE_BRANCH.exec(branch);
  if (m === null) return [];
  const n = Number(m[1]);
  const out = [];
  const onBase = fileAt(base, "ROADMAP.md");
  if (onBase !== null && openStage(onBase) !== n) {
    const open = openStage(onBase);
    out.push(`branch "${branch}": ROADMAP.md on ${base} marks ${open === null ? "no stage" : `stage ${open}`} open; build the open stage, from the latest ${base}`);
  }
  const start = git(["merge-base", base, "HEAD"]).trim();
  const atStart = fileAt(start, "ROADMAP.md");
  if (atStart !== null && openStage(atStart) !== n) {
    out.push(`branch "${branch}": it starts at ${start.slice(0, 7)}, where stage ${n} is not open; start again from the latest ${base}`);
  }
  return out;
}

/** The branch must contain what is already pushed under its name: a push never overwrites commits. */
function remoteFindings(branch) {
  if (branch === "HEAD") return [];
  const remote = `refs/remotes/origin/${branch}`;
  try {
    git(["rev-parse", "--verify", "--quiet", `${remote}^{commit}`]);
  } catch {
    return [];
  }
  try {
    git(["merge-base", "--is-ancestor", remote, "HEAD"]);
    return [];
  } catch {
    return [`branch "${branch}": origin/${branch} has commits that this branch does not contain; pushing would overwrite them. Do not force-push; tell the owner`];
  }
}

/** Files the branch adds or changes, without the two that hold the patterns on purpose. */
const EXEMPT = new Set(["scripts/check-publish.mjs", "tests/repo/checkPublish.test.ts"]);

function run(opts) {
  const base = resolveBase(opts.base);
  const findings = [];
  const branch = opts.branch ?? git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "HEAD" && !BRANCH.test(branch)) findings.push(`branch "${branch}": name it builder/<topic> or maintainer/<topic>`);
  findings.push(...stageFindings(branch, base), ...remoteFindings(branch));
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
