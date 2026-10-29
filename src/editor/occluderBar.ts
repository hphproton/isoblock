import { lanePieces } from "../core/checks/lanePieces";
import type { Scene } from "../core/types";
import { byId, el } from "./dom";
import { currentScene, type EditorStore } from "./store";

function choices(scene: Scene): { value: string; label: string }[] {
  const lanes = (scene.lanes ?? []).filter((lane) => lanePieces(lane).ok);
  const zones = (scene.zones ?? []).filter((zone) => (zone.points ?? []).length >= 3);
  return [
    ...lanes.map((lane) => ({ value: `lane:${lane.id}`, label: `lane:${lane.id}` })),
    ...zones.map((zone) => ({ value: `zone:${zone.id}`, label: `zone:${zone.id}` })),
  ];
}

/** The Occluders of controls in the overlays section (SPEC 10). */
export function mountOccluders(store: EditorStore): void {
  const root = byId("occluder-controls");
  const area = el("select", { "aria-label": "Occluders of" });
  const actor = el("input", { type: "text", "aria-label": "Actor size", placeholder: "w,d,h" });
  const step = el("input", { type: "number", "aria-label": "Occluder step", step: "any" });
  root.replaceChildren(
    el("label", {}, "Occluders of ", area),
    el("label", {}, "Actor size ", actor),
    el("label", {}, "Occluder step ", step),
  );
  let options = "";
  area.addEventListener("change", () => store.setOccluder({ area: area.value }));
  actor.addEventListener("input", () => store.setOccluder({ actor: actor.value }));
  step.addEventListener("input", () => {
    const value = step.value.trim() === "" ? Number.NaN : Number(step.value);
    store.setOccluder({ step: value });
  });

  const render = (): void => {
    const state = store.get();
    const scene = currentScene(state);
    const list = scene === null ? [] : choices(scene);
    const next = list.map((item) => item.value).join("\0");
    if (next !== options) {
      options = next;
      area.replaceChildren(
        el("option", { value: "" }, "none"),
        ...list.map((item) => el("option", { value: item.value }, item.label)),
      );
    }
    if (area.value !== state.occluder.area) area.value = state.occluder.area;
    if (document.activeElement !== actor && actor.value !== state.occluder.actor) actor.value = state.occluder.actor;
    const stepText = Number.isFinite(state.occluder.step) ? String(state.occluder.step) : "";
    if (document.activeElement !== step && step.value !== stepText) step.value = stepText;
  };
  store.subscribe((state, previous) => {
    if (currentScene(state) !== currentScene(previous) || state.occluder !== previous.occluder) render();
  });
  render();
}
