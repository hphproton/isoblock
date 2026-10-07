import { hiddenIn, withoutObjects } from "../states";
import type { CheckResult, CheckSpec, ImplementedCheck, Scene } from "../types";
import { runCheck } from "./index";
import { parseAnchorRef } from "./points";
import { canonical, skipResult } from "./result";

/** The check with hidden objects removed from its lists, or the name of a hidden object the check cannot do without. */
function restrict(scene: Scene, spec: CheckSpec, hidden: ReadonlySet<string>): ImplementedCheck | string {
  const check = spec as ImplementedCheck;
  const keep = (ids: readonly string[]): string[] => ids.filter((id) => !hidden.has(id));
  switch (check.check) {
    case "in_region":
      return check.ids === undefined ? check : { ...check, ids: keep(check.ids) };
    case "no_overlap": {
      const allow = check.allow?.filter((pair) => !pair.some((id) => hidden.has(id)));
      return {
        ...check,
        ...(check.ids === undefined ? {} : { ids: keep(check.ids) }),
        ...(allow === undefined ? {} : { allow }),
      };
    }
    case "clearance":
      return [check.a, check.b].find((id) => hidden.has(id)) ?? check;
    case "lane_clear":
      return check.ignore === undefined ? check : { ...check, ignore: keep(check.ignore) };
    case "visible":
    case "min_screen_size":
      return hidden.has(check.target) ? check.target : check;
    case "reachable": {
      for (const ref of [check.from, check.to]) {
        const anchor = typeof ref === "string" ? parseAnchorRef(scene, ref) : null;
        if (anchor !== null && hidden.has(anchor.object.id)) return anchor.object.id;
      }
      return check.ignore === undefined ? check : { ...check, ignore: keep(check.ignore) };
    }
    case "capacity":
      return {
        ...check,
        ...(check.ids === undefined ? {} : { ids: keep(check.ids) }),
        ...(check.allow === undefined ? {} : { allow: keep(check.allow) }),
      };
    default:
      return check;
  }
}

/**
 * Run every check of the scene with the objects in `hidden` removed (SPEC section 9.2): they are
 * removed from the scene and from the lists of the checks (`ids`, `allow`, `ignore`); a check that
 * names a hidden object by itself is `skip`. `state` only names the state in the messages.
 */
export function runChecksHiding(scene: Scene, hidden: ReadonlySet<string>, state: string): readonly CheckResult[] {
  const visible = withoutObjects(scene, hidden);
  return (scene.checks ?? []).map((spec) => {
    const restricted = restrict(scene, spec, hidden);
    if (typeof restricted === "string") return canonical(skipResult(spec, `object "${restricted}" is hidden in state "${state}"`));
    return runCheck(visible, restricted);
  });
}

/** Run every check of the scene as it is in a state. An unknown state is `E_USAGE`. */
export function runChecksInState(scene: Scene, state: string): readonly CheckResult[] {
  return runChecksHiding(scene, hiddenIn(scene, state), state);
}
