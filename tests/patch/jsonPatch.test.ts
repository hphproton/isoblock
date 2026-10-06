import { describe, expect, it } from "vitest";
import { applyJsonPatch, parseJsonPatch } from "../../src/core/patch/jsonPatch";

const doc = { a: { b: [1, 2, 3], c: "x" }, list: [{ id: "p" }, { id: "q" }] };

function run(patch: unknown, target: unknown = doc): unknown {
  return applyJsonPatch(target, parseJsonPatch(JSON.stringify(patch)));
}

function code(patch: unknown, target: unknown = doc): string {
  try {
    run(patch, target);
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "none";
}

describe("parseJsonPatch", () => {
  it("rejects text that is not JSON, not an array, or has bad operations", () => {
    expect(() => parseJsonPatch("[{")).toThrowError(expect.objectContaining({ code: "E_PATCH" }));
    expect(() => parseJsonPatch('{"op": "add"}')).toThrowError(expect.objectContaining({ code: "E_PATCH" }));
    for (const op of [
      1, {}, { op: "frob", path: "/a" }, { op: "add", path: "a", value: 1 }, { op: "add", path: "/a" },
      { op: "move", path: "/a" }, { op: "copy", path: "/a", from: "x" }, { op: "remove" },
    ]) {
      expect(() => parseJsonPatch(JSON.stringify([op])), JSON.stringify(op)).toThrowError(expect.objectContaining({ code: "E_PATCH" }));
    }
  });

  it("names the operation that is wrong", () => {
    expect(() => parseJsonPatch('[{"op":"remove","path":"/a"},{"op":"x","path":"/a"}]')).toThrowError(/operation 2/);
  });
});

describe("applyJsonPatch", () => {
  it("adds an object member, replaces an existing one and appends or inserts in arrays", () => {
    expect(run([{ op: "add", path: "/a/d", value: 1 }])).toEqual({ ...doc, a: { ...doc.a, d: 1 } });
    expect(run([{ op: "add", path: "/a/c", value: "y" }])).toEqual({ ...doc, a: { ...doc.a, c: "y" } });
    expect((run([{ op: "add", path: "/a/b/-", value: 4 }]) as typeof doc).a.b).toEqual([1, 2, 3, 4]);
    expect((run([{ op: "add", path: "/a/b/1", value: 9 }]) as typeof doc).a.b).toEqual([1, 9, 2, 3]);
    expect((run([{ op: "add", path: "/a/b/3", value: 9 }]) as typeof doc).a.b).toEqual([1, 2, 3, 9]);
  });

  it("replaces and removes only what exists", () => {
    expect((run([{ op: "replace", path: "/a/b/0", value: 7 }]) as typeof doc).a.b).toEqual([7, 2, 3]);
    expect((run([{ op: "remove", path: "/a/b/1" }]) as typeof doc).a.b).toEqual([1, 3]);
    expect(Object.keys((run([{ op: "remove", path: "/a/c" }]) as typeof doc).a)).toEqual(["b"]);
    expect(code([{ op: "replace", path: "/a/zzz", value: 1 }])).toBe("E_PATCH");
    expect(code([{ op: "remove", path: "/a/zzz" }])).toBe("E_PATCH");
    expect(code([{ op: "remove", path: "/a/b/3" }])).toBe("E_PATCH");
    expect(code([{ op: "replace", path: "/a/b/3", value: 1 }])).toBe("E_PATCH");
  });

  it("rejects bad array indexes and a missing parent", () => {
    for (const path of ["/a/b/4", "/a/b/-1", "/a/b/01", "/a/b/x", "/nope/x", "/a/c/x"]) {
      expect(code([{ op: "add", path, value: 1 }]), path).toBe("E_PATCH");
    }
  });

  it("tests with deep equality, ignoring key order", () => {
    expect(run([{ op: "test", path: "/list/0", value: { id: "p" } }])).toEqual(doc);
    expect(code([{ op: "test", path: "/a/b", value: [1, 2] }])).toBe("E_PATCH");
    expect(code([{ op: "test", path: "/nope", value: 1 }])).toBe("E_PATCH");
    expect(code([{ op: "test", path: "/a/b/0", value: 1.0 }])).toBe("none");
  });

  it("moves and copies", () => {
    expect((run([{ op: "move", path: "/a/d", from: "/a/c" }]) as typeof doc).a).toEqual({ b: [1, 2, 3], d: "x" });
    expect((run([{ op: "move", path: "/a/b/0", from: "/a/b/2" }]) as typeof doc).a.b).toEqual([3, 1, 2]);
    expect((run([{ op: "copy", path: "/a/d", from: "/a/b" }]) as { a: { d: unknown } }).a.d).toEqual([1, 2, 3]);
    expect(code([{ op: "move", path: "/a/b/x", from: "/a" }])).toBe("E_PATCH");
    expect(code([{ op: "move", path: "/x", from: "/nope" }])).toBe("E_PATCH");
    expect(code([{ op: "copy", path: "/x", from: "/nope" }])).toBe("E_PATCH");
    expect(run([{ op: "move", path: "/a/c", from: "/a/c" }])).toEqual(doc);
  });

  it("does not replace the whole document", () => {
    expect(code([{ op: "add", path: "", value: {} }])).toBe("E_PATCH");
    expect(code([{ op: "remove", path: "" }])).toBe("E_PATCH");
  });

  it("decodes ~0 and ~1 in pointers", () => {
    const odd = { "a/b": { "c~d": 1 } };
    expect(run([{ op: "replace", path: "/a~1b/c~0d", value: 2 }], odd)).toEqual({ "a/b": { "c~d": 2 } });
  });

  it("applies in order, and names the failing operation", () => {
    expect(() => run([{ op: "add", path: "/a/d", value: 1 }, { op: "remove", path: "/a/zzz" }])).toThrowError(/operation 2 \(remove \/a\/zzz\)/);
    expect((run([{ op: "add", path: "/a/d", value: 1 }, { op: "replace", path: "/a/d", value: 2 }]) as typeof doc).a).toMatchObject({ d: 2 });
  });

  it("does not let a __proto__ path reach Object.prototype", () => {
    const out = run([{ op: "add", path: "/__proto__", value: { polluted: true } }]) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(code([{ op: "add", path: "/__proto__/x", value: 1 }])).toBe("E_PATCH");
    expect(code([{ op: "replace", path: "/constructor/name", value: "x" }])).toBe("E_PATCH");
  });

  it("never changes its input", () => {
    const frozen = structuredClone(doc);
    run([{ op: "add", path: "/a/b/-", value: 4 }, { op: "remove", path: "/list/0" }, { op: "replace", path: "/a/c", value: 1 }]);
    expect(doc).toEqual(frozen);
  });

  it("keeps the key order of the document and appends new keys last", () => {
    const out = run([{ op: "add", path: "/a/new", value: 1 }, { op: "replace", path: "/a/b", value: [] }]) as typeof doc;
    expect(Object.keys(out.a)).toEqual(["b", "c", "new"]);
  });
});
