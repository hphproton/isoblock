import { boxInfo, orderInfos } from "../drawOrder";
import { worldParts } from "../geometry";
import { orderDirection } from "../projection";
import type { Scene } from "../types";

/**
 * The painter's order of every part of the scene (SPEC 13.4). The result has one list per object,
 * in file order, with one number per part in type order: the part's position in the order, 0 for
 * the part drawn first. The display list draws object faces in the same order.
 */
export function partOrders(scene: Scene): readonly (readonly number[])[] {
  const c = orderDirection(scene.camera);
  const counts: number[] = [];
  const infos = scene.objects.flatMap((object) => {
    const parts = worldParts(scene, object);
    counts.push(parts.length);
    return parts.map((part) => boxInfo(part.box, scene.camera, c));
  });
  const position = new Array<number>(infos.length).fill(0);
  orderInfos(infos, c).forEach((index, place) => {
    position[index] = place;
  });
  let next = 0;
  return counts.map((count) => {
    const orders = position.slice(next, next + count);
    next += count;
    return orders;
  });
}
