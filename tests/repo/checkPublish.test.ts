// Tests of the publication check (SPEC section 20), on throwaway git repositories.
// Maintained by the maintainer with scripts/check-publish.mjs; this file holds session-like links on purpose.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../helpers/fixtures";

const script = join(repoRoot, "scripts", "check-publish.mjs");
const noreply = { name: "Builder", email: "12345+builder@users.noreply.github.com" };
const dirs: string[] = [];

function git(dir: string, args: string[], who = noreply): void {
  const env = { ...process.env, GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** A repository with one commit on main and a branch `builder/work` checked out. */
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "publish-"));
  dirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(join(dir, "a.txt"), "start\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "Start"]);
  git(dir, ["checkout", "-q", "-b", "builder/work"]);
  return dir;
}

function commit(dir: string, file: string, text: string, message: string, who = noreply): void {
  writeFileSync(join(dir, file), text);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", message], who);
}

function check(dir: string, ...args: string[]): { code: number | null; out: string } {
  const r = spawnSync("node", [script, "--base", "main", ...args], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("publication check (SPEC 20)", () => {
  it("passes a clean branch with a body and the allowed trailers", () => {
    const dir = repo();
    commit(dir, "b.txt", "plain text, version pkg@1.2.3, remote git@github.com\n", "Add b\n\nBody line that says what changed and why.\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>\nCo-authored-by: Someone <12345+someone@users.noreply.github.com>\nSigned-off-by: Builder <12345+builder@users.noreply.github.com>");
    const r = check(dir);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 commits and 1 added lines since main, nothing found/);
  });

  it("accepts no-reply addresses and listed agent identities as authors", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b", { name: "A", email: "12345+someone@users.noreply.github.com" });
    commit(dir, "c.txt", "x\n", "Add c", { name: "B", email: "no-reply@mail.vendor.dev" });
    commit(dir, "d.txt", "x\n", "Add d", { name: "Cursor Agent", email: "cursoragent@cursor.com" });
    expect(check(dir).code).toBe(0);
  });

  it("refuses look-alikes, personal addresses and made-up identities", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b", { name: "C", email: "noreply.fan@home-mail.zz" });
    commit(dir, "c.txt", "x\n", "Add c", { name: "Someone", email: "someone@home-mail.zz" });
    commit(dir, "d.txt", "x\n", "Add d", { name: "IsoBlock Builder", email: "builder@noreply.invalid" });
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/author email is not a no-reply address or a known agent identity/);
    expect(r.out).toMatch(/committer email is not a no-reply address or a known agent identity/);
    expect(r.out).toMatch(/author email is a made-up address; commit with your environment's identity/);
  });

  it("finds session lines, URLs and schemeless session links in a commit message", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b\n\nClaude-Session: https://claude.ai/code/session_0123456789abcdef");
    commit(dir, "c.txt", "x\n", "Add c\n\nAgent Session: see claude.ai/code/session_abcdef0123456789");
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/message line 3: URL/);
    expect(r.out).toMatch(/names a session or task/);
    expect(r.out).toMatch(/message line 3: link to an agent session/);
    expect(r.out).toMatch(/trailer "claude-session" is not allowed/);
  });

  it("checks the subject", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "feat: add b.");
    commit(dir, "c.txt", "x\n", `Add ${"c".repeat(70)}`);
    commit(dir, "d.txt", "x\n", "[stage 9] Add d\nno blank line");
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/subject ends with a period/);
    expect(r.out).toMatch(/subject does not start with a capital letter/);
    expect(r.out).toMatch(/subject has a prefix/);
    expect(r.out).toMatch(/subject longer than 72 characters/);
    expect(r.out).toMatch(/no blank line after the subject/);
  });

  it("checks the body and the trailers", () => {
    const dir = repo();
    const long = "This body line goes on and on well past the seventy-two columns of the rule.";
    commit(dir, "b.txt", "x\n", `Add b\n\n## Summary\n${long}\nCo-authored-by: Early <noreply@anthropic.com>\n\nCo-authored-by: A <noreply@anthropic.com>\nCo-authored-by: A again <noreply@anthropic.com>\nCo-authored-by: B <someone@home-mail.zz>\nReviewed-by: C <noreply@anthropic.com>`);
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Markdown heading in the body/);
    expect(r.out).toMatch(/body line longer than 72 characters/);
    expect(r.out).toMatch(/trailer outside the last block/);
    expect(r.out).toMatch(/co-authored-by line repeated for one address/);
    expect(r.out).toMatch(/co-authored-by address is not a no-reply address or a known agent identity/);
    expect(r.out).toMatch(/trailer "reviewed-by" is not allowed/);
  });

  it("finds session links and personal addresses in added lines, with file and line", () => {
    const dir = repo();
    commit(dir, "notes.md", "one\nsee https://chatgpt.com/codex/tasks/task_e_1234abcd\nmail someone@home-mail.zz\nok noreply@example.com and cursoragent@cursor.com\n", "Add notes");
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/notes\.md:2: link to an agent session/);
    expect(r.out).toMatch(/notes\.md:3: email address that is not a no-reply address/);
    expect(r.out).not.toMatch(/notes\.md:4/);
  });

  it("treats a line that starts with +++ inside a hunk as content", () => {
    const dir = repo();
    commit(dir, "notes.md", "++ b/scripts/check-publish.mjs\nsee jules.google.com/session/123\n", "Add notes");
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/notes\.md:2: link to an agent session/);
  });

  it("checks the branch name", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b");
    expect(check(dir, "--branch", "maintainer/stage-9").code).toBe(0);
    const r = check(dir, "--branch", "agent/quiet-river-a1b2");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/name it builder\/<topic> or maintainer\/<topic>/);
  });

  it("checks that a stage branch builds the stage open on the base, from after its opening", () => {
    const dir = repo();
    git(dir, ["checkout", "-q", "main"]);
    commit(dir, "ROADMAP.md", "# Roadmap\n\n## Stage 2 \u00b7 open\n", "Open stage 2");
    git(dir, ["checkout", "-q", "-b", "builder/stage-2"]);
    commit(dir, "b.txt", "x\n", "Add b");
    expect(check(dir).code).toBe(0);
    // main moves on: stage 2 done, stage 3 open. The old branch, renamed, no longer passes.
    git(dir, ["checkout", "-q", "main"]);
    commit(dir, "ROADMAP.md", "# Roadmap\n\n## Stage 2 \u00b7 done (0.2.0)\n\n## Stage 3 \u00b7 open\n", "Open stage 3");
    git(dir, ["checkout", "-q", "builder/stage-2"]);
    let r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/ROADMAP\.md on main marks stage 3 open; build the open stage/);
    git(dir, ["branch", "-q", "-m", "builder/stage-3"]);
    r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/where stage 3 is not open; start again from the latest main/);
    expect(r.out).not.toMatch(/marks stage 3 open/);
    // started from the latest main: passes
    git(dir, ["checkout", "-q", "-b", "builder/stage-3b", "main"]);
    git(dir, ["branch", "-q", "-D", "builder/stage-3"]);
    git(dir, ["branch", "-q", "-m", "builder/stage-3"]);
    commit(dir, "c.txt", "x\n", "Add c");
    expect(check(dir).code).toBe(0);
  });

  it("finds a push that would overwrite the remote branch", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b");
    git(dir, ["update-ref", "refs/remotes/origin/builder/work", "HEAD"]);
    commit(dir, "c.txt", "x\n", "Add c");
    expect(check(dir).code).toBe(0);
    git(dir, ["reset", "-q", "--hard", "HEAD~2"]);
    commit(dir, "d.txt", "x\n", "Add d");
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/origin\/builder\/work has commits that this branch does not contain; pushing would overwrite them/);
  });

  it("checks a pull request title and description", () => {
    const dir = repo();
    commit(dir, "b.txt", "x\n", "Add b");
    const body = join(dir, "body.txt");
    writeFileSync(body, "Summary\n\nhttps://jules.google.com/session/123\n");
    const r = check(dir, "--title", "Stage 9: fixes", "--body-file", body);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/pull request description line 3: link to an agent session/);
    expect(r.out).not.toMatch(/pull request title/);
  });

  it("stops with exit code 2 on an unknown base, a bad argument or a git error", () => {
    const dir = repo();
    expect(spawnSync("node", [script, "--base", "nowhere"], { cwd: dir, encoding: "utf8" }).status).toBe(2);
    expect(spawnSync("node", [script, "--bad"], { cwd: dir, encoding: "utf8" }).status).toBe(2);
    const outside = mkdtempSync(join(tmpdir(), "publish-none-"));
    dirs.push(outside);
    expect(spawnSync("node", [script], { cwd: outside, encoding: "utf8" }).status).toBe(2);
  });
});
