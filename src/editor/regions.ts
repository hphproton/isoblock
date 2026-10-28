import { byId, el } from "./dom";
import { currentScene, type EditorStore } from "./store";

/** The Regions section: one checkbox per frame region and state (SPEC 10). */
export function mountRegions(store: EditorStore): void {
  const root = byId("regions-body");
  let key = "";
  const boxes = new Map<string, HTMLInputElement>();

  const sync = (): void => {
    const scene = currentScene(store.get());
    if (scene === null) return;
    for (const [name, box] of boxes) {
      const [region, state] = name.split("\0");
      const on = scene.states?.[state ?? ""]?.hideRegions?.includes(region ?? "") === true;
      if (box.checked !== on) box.checked = on;
    }
  };

  const render = (): void => {
    const scene = currentScene(store.get());
    if (scene === null) {
      key = "";
      boxes.clear();
      root.replaceChildren(el("p", { class: "hint" }, "No scene is open."));
      return;
    }
    const states = Object.keys(scene.states ?? {});
    const regions = scene.frame.regions.map((region) => region.id);
    const next = `${states.join("\0")}|${regions.join("\0")}`;
    if (next === key) {
      sync();
      return;
    }
    key = next;
    boxes.clear();
    if (states.length === 0) {
      root.replaceChildren(el("p", { class: "hint" }, "This scene has no states."));
      return;
    }
    const labels = regions.flatMap((region) => states.map((state) => {
      const name = `Region ${region} hidden in ${state}`;
      const box = el("input", { type: "checkbox", "aria-label": name });
      box.addEventListener("change", () => {
        store.applyLine(`${box.checked ? "hide" : "show"} ${state} region:${region}`);
        sync();
      });
      boxes.set(`${region}\0${state}`, box);
      return el("label", {}, box, name);
    }));
    root.replaceChildren(el("div", { class: "hides" }, ...labels));
    sync();
  };

  store.subscribe((state, previous) => {
    if (currentScene(state) !== currentScene(previous)) render();
  });
  render();
}
