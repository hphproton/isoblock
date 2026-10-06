import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Build `dist/` once before any test file runs, so no test file rebuilds it while another reads it. */
export default function setup(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  execFileSync("npm", ["run", "build", "--silent"], { cwd: root, stdio: "pipe" });
}
