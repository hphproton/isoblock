import { IsoblockError } from "../core/errors";
import { serializeScene } from "../core/serialize";
import type { Scene } from "../core/types";
import { parseScene } from "../core/validate";

/** Read and validate a scene file (schema and references, like `isoblock validate`). */
export async function readSceneFile(file: File): Promise<Scene> {
  return parseScene(await file.text());
}

/** Hand the scene to the browser as a download. The bytes depend only on the scene. */
export function downloadScene(scene: Scene, fileName: string): void {
  const blob = new Blob([serializeScene(scene)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** One line for the status bar, with the first problems of a validation error. */
export function describeError(error: unknown): string {
  if (!(error instanceof IsoblockError)) return error instanceof Error ? error.message : String(error);
  const shown = error.details.slice(0, 3).join("; ");
  const more = error.details.length > 3 ? ` (+${error.details.length - 3} more)` : "";
  return `${error.code}: ${error.message}${shown === "" ? "" : ` - ${shown}${more}`}`;
}
