import type { Rect } from "../geometry";
import { eachActorPosition, eachContactPosition } from "./sortPositions";
import { recordActor, type PositionRank, type SortPass } from "./sortMeasure";

/** Grid positions of 9.3, plus contact positions when `edges` is set (SPEC 9.10). */
export function countGrid(pass: SortPass): PositionRank {
  const search = pass.search as NonNullable<SortPass["search"]>;
  const worst = pass.examined.map((index) => pass.base[index] as number);
  let positions = 0;
  pass.examined.forEach((index, slot) => {
    const foot = pass.footprints[index] as Rect;
    const visit = (actor: Rect): void => {
      positions += 1;
      recordActor(pass, index, slot, worst, actor, search.level);
    };
    eachActorPosition(foot, search, visit);
    if (pass.spec.edges === true) eachContactPosition(foot, search, visit);
  });
  return { worst, positions };
}
