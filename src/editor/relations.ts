import { fmt } from "../core/format";
import { evaluateRelations, type RelationResult } from "../core/relations/evaluate";
import { solveScene } from "../core/solver/solve";
import type { Relation } from "../core/types";
import { byId, el, setText } from "./dom";
import { currentScene, type EditorState, type EditorStore } from "./store";

const TIMES = "\u00d7";
const STATUS = { satisfied: "OK", violated: "BAD", skip: "SKIP" } as const;

function targets(relation: Relation): string {
  if (relation.rel === "order_along") return (relation.ids ?? []).join(TIMES);
  if (relation.b === undefined || relation.b === "") return relation.a ?? "";
  return `${relation.a ?? ""}${TIMES}${relation.b}`;
}

function detail(result: RelationResult): string {
  if (result.status === "skip" || result.violation === null) return result.message;
  return fmt(result.violation);
}

/** The Relations section: live rows, and Solve with its proposal (SPEC 10). */
export function mountRelations(store: EditorStore): void {
  const count = byId("relations-count");
  const actions = byId("relations-actions");
  const list = byId("relations-list");
  const only = el("input", { type: "checkbox", "aria-label": "Only the selected object" });
  const turn = el("input", { type: "checkbox", "aria-label": "Turn objects" });
  const solve = el("button", { type: "button" }, "Solve");
  const summary = el("p", { class: "hint" });
  const apply = el("button", { type: "button" }, "Apply");
  const discard = el("button", { type: "button" }, "Discard");
  const proposal = el("div", { class: "proposal" }, summary, apply, discard);
  actions.replaceChildren(
    el("label", {}, only, "Only the selected object"),
    el("label", {}, turn, "Turn objects"),
    solve,
    proposal,
  );

  solve.addEventListener("click", () => {
    const scene = currentScene(store.get());
    if (scene === null || store.get().proposal !== null) return;
    const selected = store.get().selected;
    const ids = only.checked && selected !== null ? [selected] : undefined;
    const outcome = solveScene(scene, ids, turn.checked);
    store.showProposal(outcome.report, ids ?? null, turn.checked);
  });
  apply.addEventListener("click", () => store.applyProposal());
  discard.addEventListener("click", () => store.discardProposal());

  let shown = "";
  const render = (state: EditorState): void => {
    const scene = currentScene(state);
    const open = scene !== null;
    solve.disabled = !open || state.proposal !== null;
    proposal.hidden = state.proposal === null;
    if (state.proposal !== null) {
      const report = state.proposal.report;
      const turns = report.turned?.length ?? 0;
      setText(summary, `${report.status}, ${report.moved.length} moved, soft penalty ${report.softPenalty.toFixed(2)}`);
      apply.disabled = report.moved.length === 0 && turns === 0;
    }
    if (scene === null) {
      shown = "";
      setText(count, "");
      list.replaceChildren(el("li", { class: "hint" }, "No scene is open."));
      return;
    }
    const relations = scene.relations ?? [];
    const results = evaluateRelations(scene).results;
    const byRelation = new Map(relations.map((relation) => [relation.id, relation]));
    const violated = results.filter((row) => row.status === "violated").length;
    const skipped = results.filter((row) => row.status === "skip").length;
    setText(count, `${violated} violated, ${skipped} skipped`);
    const conflict = state.proposal?.report.status === "conflict" ? new Set(state.proposal.report.conflict) : null;
    const signature = `${results.map((row) => `${row.id}:${row.status}:${row.violation}`).join("|")}|${state.highlightRelation ?? ""}|${conflict === null ? "" : [...conflict].join(",")}|${state.proposal?.report.status ?? ""}|${state.proposal?.report.moved.length ?? ""}`;
    if (signature === shown) return;
    shown = signature;
    if (results.length === 0) {
      list.replaceChildren(el("li", { class: "hint" }, "This scene has no relations."));
      return;
    }
    list.replaceChildren(...results.map((result) => {
      const relation = byRelation.get(result.id);
      const button = el(
        "button",
        {
          type: "button",
          class: "check relation",
          "data-relation": result.id,
          "data-status": result.status,
          "data-conflict": conflict?.has(result.id) === true ? "true" : false,
          "aria-pressed": String(state.highlightRelation === result.id),
        },
        el("span", { class: "badge" }, STATUS[result.status]),
        el("span", { class: "title" }, `${result.id} ${result.rel}`),
        el("span", { class: "message" }, `${relation === undefined ? "" : targets(relation)} ${detail(result)}`),
      );
      button.addEventListener("click", () => store.highlightRelation(result.id));
      return el("li", {}, button);
    }));
  };
  store.subscribe((state, previous) => {
    if (
      currentScene(state) !== currentScene(previous) ||
      state.proposal !== previous.proposal ||
      state.highlightRelation !== previous.highlightRelation ||
      state.history !== previous.history
    ) {
      render(state);
    }
  });
  render(store.get());
}
