## Tests of the adapter: golden vectors and sort keys, the node tree, instancing, states, actors
## and the reported errors.
## Run by `npm run test:godot`: godot --script res://test/adapter_test.gd -- --golden F --sort F --runtime F
extends SceneTree

const Runtime := preload("res://isoblock_runtime.gd")
const Args := preload("res://test/args.gd")
const TOLERANCE := 0.001

var checks := 0
var failures := 0


func _initialize() -> void:
	var args := Args.parse()
	_golden(JSON.parse_string(FileAccess.get_file_as_string(args["golden"])))
	_sort_keys(JSON.parse_string(FileAccess.get_file_as_string(args["sort"])))
	var loaded := Runtime.load_file(args["runtime"])
	_expect(loaded["code"] == "", "the runtime file loads")
	var data: Dictionary = loaded["data"]
	_tree(data)
	_sprite_ties(data)
	_faces(data)
	_instancing(data)
	_states(data)
	_actors(data)
	_actor_ties(data)
	_errors(data)
	print("godot adapter: %d checks, %d failed" % [checks, failures])
	quit(1 if failures > 0 else 0)


func _expect(ok: bool, what: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		printerr("FAILED: %s" % what)


func _near(a: Vector2, b: Vector2, tolerance: float) -> bool:
	return absf(a.x - b.x) <= tolerance and absf(a.y - b.y) <= tolerance


func _color(object: Dictionary) -> Color:
	return Color.from_hsv(float(str(object["id"]).hash() % 360) / 360.0, 0.8, 0.9)


func _golden(golden: Dictionary) -> void:
	for set in [golden, golden["dimetric21"]]:
		for c in set["cases"]:
			var p := Runtime.project(set["camera"], c["uvh"][0], c["uvh"][1], c["uvh"][2])
			_expect(_near(p, Vector2(c["xy"][0], c["xy"][1]), TOLERANCE), "project %s" % [c["uvh"]])
		var dir := Runtime.camera_direction(set["camera"])
		var want := Vector3(set["cameraDir"][0], set["cameraDir"][1], set["cameraDir"][2])
		_expect(dir.distance_to(want) <= TOLERANCE, "camera direction %s" % [dir])
	for c in golden["inverse"]:
		var uv := Runtime.unproject(golden["camera"], Vector2(c["xyh"][0], c["xyh"][1]), c["xyh"][2])
		_expect(_near(uv, Vector2(c["uv"][0], c["uv"][1]), TOLERANCE), "unproject %s" % [c["xyh"]])


## The keys of tests/golden/sort.json through `sort_key`, with the camera direction of the draw order.
func _sort_keys(sort: Dictionary) -> void:
	for c in sort["keys"]:
		var key := Runtime.sort_key(Runtime.order_direction(c["camera"]), c["footprint"])
		_expect(absf(key - float(c["key"])) <= float(sort["tolerance"]), "sort key %s under %s: %s, expected %s" % [c["footprint"], c["camera"], key, c["key"]])
	var dir := Runtime.order_direction({ "angleU": 30, "angleV": 150, "pxPerUnit": 100, "origin": [0, 0] })
	_expect(dir == [1.0, 1.0, 1.0], "true isometric gives the direction [1, 1, 1] exactly: %s" % [dir])
	_expect(Runtime.sort_key([1.0, 1.0, 1.0], [0.1234564, 0, 0, 0]) == 0.123456 and Runtime.sort_key([1.0, 1.0, 1.0], [0.0078125, 0, 0, 0]) == 0.007813, "keys are rounded to 6 decimals, halves up")


## Sprite nodes as [object, slice, key] in child order; actors as [actor id, key].
func _order(root: Node2D) -> Array:
	return root.get_node("Sprites").get_children().map(func(n: Node) -> Array: return [n.get_meta("object"), n.get_meta("slice"), n.get_meta("key")] if n.has_meta("object") else [n.get_meta("actor"), n.get_meta("key")])


## The sprites of the file in the order of the engine rule: ascending key, the sprite list on equal keys.
func _engine_order(data: Dictionary) -> Array:
	var list: Array = []
	for object in data["objects"]:
		for k in object["sprites"].size():
			list.append([object["id"], k, object["sprites"][k]["key"]])
	var sorted: Array = []
	for entry in list:
		var at := sorted.size()
		while at > 0 and float(sorted[at - 1][2]) > float(entry[2]):
			at -= 1
		sorted.insert(at, entry)
	return sorted


func _tree(data: Dictionary) -> void:
	var built := Runtime.build(data, _color)
	_expect(built["code"] == "" and built["root"] != null and built["unmapped"] == [], "build succeeds and, without scenes, reports no unmapped type")
	var root: Node2D = built["root"]
	_expect(root.get_children().map(func(n: Node) -> String: return n.name) == ["Objects", "Sprites", "Zones", "Lanes"], "root has Objects, Sprites, Zones and Lanes")
	var objects := root.get_node("Objects")
	_expect(objects.get_child_count() == data["objects"].size(), "one node per object")
	for object in data["objects"]:
		var node: Node2D = objects.get_node(NodePath(object["id"]))
		for key in ["id", "type", "rot", "tags", "footprint"]:
			_expect(node.get_meta(key) == object[key], "%s keeps its %s" % [object["id"], key])
		_expect(node.get_children().all(func(n: Node) -> bool: return n is Marker2D) and node.get_child_count() == object["anchors"].size(), "%s holds only its anchors" % object["id"])
		for anchor in object["anchors"]:
			var marker: Marker2D = node.get_node(NodePath(anchor["id"]))
			var want := Runtime.project(data["camera"], anchor["at"][0], anchor["at"][1], anchor["at"][2])
			_expect(_near(marker.position, want, 1e-4), "%s/%s: marker at the projected anchor" % [object["id"], anchor["id"]])
			_expect(marker.get_meta("kind") == anchor.get("kind", "") and marker.get_meta("facing") == anchor.get("facing", ""), "%s/%s: kind and facing" % [object["id"], anchor["id"]])
	var sprites := root.get_node("Sprites")
	_expect(_order(root) == _engine_order(data), "the sprites are children in the order of the engine rule")
	var by_id := {}
	for object in data["objects"]:
		by_id[object["id"]] = object
	for node in sprites.get_children():
		var object: Dictionary = by_id[node.get_meta("object")]
		var sprite: Dictionary = object["sprites"][node.get_meta("slice")]
		_expect(node is Node2D and node.z_index == 0 and node.z_as_relative and not sprites.y_sort_enabled, "%s: z_index 0, relative, no y-sort" % node.name)
		var count := 0
		for piece in sprite["pieces"]:
			count += Runtime.faces(data["camera"], data["cameraDir"], piece["box"]).size()
		_expect(node.get_child_count() == count, "%s: the faces of its pieces" % node.name)
		_expect(node.get_children().all(func(p: Node) -> bool: return p is Polygon2D and not p.antialiased and p.color == _color(object) and p.z_index == 0), "%s: flat faces in the object's color, without antialiasing" % node.name)
	for zone in data["zones"]:
		var polygon: Polygon2D = root.get_node("Zones").get_node(NodePath(zone["id"]))
		_expect(not polygon.visible and polygon.get_meta("kind") == zone.get("kind", ""), "zone %s is hidden and keeps its kind" % zone["id"])
		_expect(polygon.polygon.size() == zone["points"].size(), "zone %s has its points" % zone["id"])
	for lane in data["lanes"]:
		var line: Line2D = root.get_node("Lanes").get_node(NodePath(lane["id"]))
		_expect(not line.visible and line.points.size() == lane["points"].size() and line.get_meta("width") == lane["width"], "lane %s is hidden and keeps its data" % lane["id"])
	root.free()


## Sprites with equal keys keep the order of the sprite list: objects in file order, slices in order.
func _sprite_ties(data: Dictionary) -> void:
	for reverse in [false, true]:
		var flat := data.duplicate(true)
		if reverse:
			flat["objects"].reverse()
		var want: Array = []
		for object in flat["objects"]:
			for k in object["sprites"].size():
				object["sprites"][k]["key"] = 1.0
				want.append([object["id"], k, 1.0])
		var root: Node2D = Runtime.build(flat)["root"]
		_expect(_order(root) == want, "sprites with equal keys keep the order of the sprite list (objects reversed: %s)" % reverse)
		root.free()


## Faces that point toward the camera: three for a diagonal camera, two when it is edge-on to one side.
func _faces(data: Dictionary) -> void:
	var camera: Dictionary = data["camera"]
	var box := [0.0, 0.0, 0.0, 1.0, 1.0, 1.0]
	var diagonal := Runtime.faces(camera, [1.0, 1.0, 1.0], box)
	_expect(diagonal.size() == 3, "a diagonal camera shows three faces")
	var corners := PackedVector2Array([Runtime.project(camera, 0, 0, 1), Runtime.project(camera, 1, 0, 1), Runtime.project(camera, 1, 1, 1), Runtime.project(camera, 0, 1, 1)])
	_expect(diagonal.size() == 3 and diagonal[2] == corners, "the top face is the projected top of the box")
	var u_side := PackedVector2Array([Runtime.project(camera, 1, 0, 0), Runtime.project(camera, 1, 1, 0), Runtime.project(camera, 1, 1, 1), Runtime.project(camera, 1, 0, 1)])
	_expect(diagonal.size() == 3 and diagonal[0] == u_side, "the first face is the side at the high u")
	var behind := Runtime.faces(camera, [-1.0, 1.0, 1.0], box)
	var low_u := PackedVector2Array([Runtime.project(camera, 0, 0, 0), Runtime.project(camera, 0, 1, 0), Runtime.project(camera, 0, 1, 1), Runtime.project(camera, 0, 0, 1)])
	_expect(behind.size() == 3 and behind[0] == low_u, "a camera on the other side shows the side at the low u")
	_expect(Runtime.faces(camera, [0.0, 1.0, 1.0], box).size() == 2, "a camera edge-on to the u side shows two faces")
	_expect(Runtime.faces(camera, [1.0, 1.0, 1.0], [0.0, 0.0, 0.0, 1.0, 1.0, 0.0]).size() == 1, "a box with no height draws only its top")


## A PackedScene with one white square, standing in for a game's art.
func _art() -> PackedScene:
	var art := Node2D.new()
	var square := Polygon2D.new()
	square.polygon = PackedVector2Array([Vector2(-5, -5), Vector2(5, -5), Vector2(5, 5), Vector2(-5, 5)])
	art.add_child(square)
	square.owner = art
	var packed := PackedScene.new()
	packed.pack(art)
	art.free()
	return packed


func _instancing(data: Dictionary) -> void:
	var sliced := ""
	var whole := ""
	for object in data["objects"]:
		if object["sprites"].size() > 1 and sliced == "":
			sliced = object["type"]
		elif object["sprites"].size() == 1 and whole == "" and object["type"] != sliced:
			whole = object["type"]
	_expect(sliced != "" and whole != "" and sliced != whole, "the sample has a sliced type and a type of one sprite")
	var art := _art()
	var built := Runtime.build(data, _color, { sliced: art, whole: art })
	var want: Array = []
	for object in data["objects"]:
		if object["type"] != sliced and object["type"] != whole and not want.has(object["type"]):
			want.append(object["type"])
	_expect(built["code"] == "" and built["unmapped"] == want, "unmapped lists the other types once, in the order of their first object: %s" % [built["unmapped"]])
	var root: Node2D = built["root"]
	var by_id := {}
	for object in data["objects"]:
		by_id[object["id"]] = object
	for node in root.get_node("Sprites").get_children():
		var object: Dictionary = by_id[node.get_meta("object")]
		var k: int = node.get_meta("slice")
		var f: Array = object["footprint"]
		var pivot := Runtime.project(data["camera"], (f[0] + f[2]) / 2.0, (f[1] + f[3]) / 2.0, 0.0)
		if object["type"] == whole:
			var instance: Node2D = node.get_child(0)
			_expect(node.get_child_count() == 1 and instance.get_child(0) is Polygon2D, "%s: one sprite holds the instance directly" % node.name)
			_expect(_near(instance.position, pivot, 1e-4), "%s: the instance sits on the pivot" % node.name)
			_expect([instance.get_meta("object"), instance.get_meta("type"), instance.get_meta("rot"), instance.get_meta("slice")] == [object["id"], object["type"], object["rot"], 0], "%s: instance metadata" % node.name)
		elif object["type"] == sliced:
			var mask: Polygon2D = node.get_child(0)
			_expect(node.get_child_count() == 1 and mask.clip_children == CanvasItem.CLIP_CHILDREN_ONLY and mask.get_child_count() == 1, "%s: a mask that clips its own instance" % node.name)
			var instance: Node2D = mask.get_child(0)
			_expect(_near(instance.position, pivot, 1e-4) and instance.get_meta("slice") == k and instance.get_meta("object") == object["id"], "%s: the slice's instance sits on the object's pivot" % node.name)
			_expect(_hull_holds(mask.polygon, data["camera"], object["sprites"][k]["pieces"]), "%s: the mask is the convex hull of the projected pieces" % node.name)
		else:
			_expect(node.get_child_count() > 0 and node.get_children().all(func(p: Node) -> bool: return p is Polygon2D and p.clip_children == CanvasItem.CLIP_CHILDREN_DISABLED), "%s: an unmapped type draws debug faces" % node.name)
	root.free()
	var none := Runtime.build(data, _color, {})
	_expect(none["unmapped"] == [], "an empty map reports no unmapped type")
	none["root"].free()


## The hull is convex, each of its points is a projected corner, and it holds every projected corner.
func _hull_holds(hull: PackedVector2Array, camera: Dictionary, pieces: Array) -> bool:
	var corners := PackedVector2Array()
	for piece in pieces:
		var b: Array = piece["box"]
		for i in 8:
			corners.append(Runtime.project(camera, b[0] if i & 1 == 0 else b[3], b[1] if i & 2 == 0 else b[4], b[2] if i & 4 == 0 else b[5]))
	if hull.size() < 3 or hull[0] == hull[hull.size() - 1]:
		return false
	for p in hull:
		if not corners.has(p):
			return false
	var grown := Geometry2D.offset_polygon(hull, 0.01)
	return grown.size() == 1 and Array(corners).all(func(c: Vector2) -> bool: return Geometry2D.is_point_in_polygon(c, grown[0]))


## Ids of the objects with a visible sprite, sorted.
func _visible_objects(root: Node2D) -> Array:
	var shown: Array = []
	for node in root.get_node("Sprites").get_children():
		if node.has_meta("object") and node.visible and not shown.has(node.get_meta("object")):
			shown.append(node.get_meta("object"))
	shown.sort()
	return shown


func _states(data: Dictionary) -> void:
	_expect(data["states"].size() > 0, "the sample has states")
	var root: Node2D = Runtime.build(data)["root"]
	var all: Array = data["objects"].map(func(o: Dictionary) -> String: return o["id"])
	all.sort()
	Runtime.add_actor(root, "a", [0.4, 0.4, 1.7], [0.0, 0.0])
	for name in data["states"]:
		var hide: Array = data["states"][name]["hide"]
		_expect(Runtime.apply_state(root, name)["code"] == "", "state %s applies" % name)
		_expect(_visible_objects(root) == all.filter(func(id: String) -> bool: return not hide.has(id)), "state %s hides the sprites of %s" % [name, hide])
		_expect(root.get_node("Objects").get_children().all(func(n: Node) -> bool: return n.visible != hide.has(n.get_meta("id"))), "state %s hides the objects and their anchors" % name)
		_expect(Runtime._actor(root, "a").visible, "state %s leaves the actor alone" % name)
		var unknown := Runtime.apply_state(root, "no such state")
		_expect(unknown["code"] == "E_STATE" and _visible_objects(root).size() == all.size() - hide.size(), "an unknown state is E_STATE and changes nothing")
	_expect(Runtime.apply_state(root, "")["code"] == "" and _visible_objects(root) == all, "\"\" shows every object")
	_expect(root.get_node("Objects").get_children().all(func(n: Node) -> bool: return n.visible), "\"\" shows every anchor")
	root.free()


func _actors(data: Dictionary) -> void:
	var root: Node2D = Runtime.build(data)["root"]
	var game := Node2D.new()
	game.position = Vector2(3, 4)
	_expect(Runtime.add_actor(root, "hero", [0.4, 0.4, 1.7], [2.35, 2.9], game)["code"] == "", "add an actor with the game's node")
	var hero := Runtime._actor(root, "hero")
	_expect(hero.get_parent() == root.get_node("Sprites") and hero.get_meta("actor") == "hero" and game.get_parent() == hero, "the actor is a child of Sprites and holds the game's node")
	_expect(_near(game.global_position, Runtime.project(data["camera"], 2.35, 2.9, 0.0), 1e-4), "the game's node sits at the projection of `at`")
	_expect(hero.get_meta("key") == Runtime.sort_key(data["cameraDir"], [2.15, 2.7, 2.55, 3.1]), "the actor's key is the key of its footprint")
	_expect(Runtime.add_actor(root, "box", [0.5, 0.5, 1.0], Vector2(4.2, 1.3), null, Color.RED)["code"] == "", "add an actor drawn as a box")
	var box := Runtime._actor(root, "box")
	_expect(box.get_meta("key") == Runtime.sort_key(data["cameraDir"], [3.95, 1.05, 4.45, 1.55]), "a Vector2 position gives the key of its decimal value")
	# In single precision (5.7, 6.2) would give 23.799999.
	Runtime.add_actor(root, "single", [0.4, 0.4, 1.7], Vector2(5.7, 6.2))
	_expect(Runtime._actor(root, "single").get_meta("key") == 23.8 and Runtime.sort_key([1.0, 1.0, 1.0], [5.5, 6.0, 5.9, 6.4]) == 23.8, "Vector2(5.7, 6.2) gives the key 23.8")
	Runtime.remove_actor(root, "single")
	_expect(box.get_child_count() == 3 and box.get_children().all(func(p: Node) -> bool: return p is Polygon2D and p.color == Color.RED and not p.antialiased), "the box draws its three faces in its color")
	var faces := Runtime.faces(data["camera"], data["cameraDir"], [3.95, 1.05, 0.0, 4.45, 1.55, 1.0])
	_expect(_near(box.get_child(2).polygon[0] + box.position, faces[2][0], 1e-3), "the box is drawn where its footprint is")
	_expect(_in_engine_order(root), "actors take their place by the engine rule")
	for at in [[0.5, 0.5], [6.0, 2.0], [-3.0, 9.0], [4.2, 1.3]]:
		_expect(Runtime.move_actor(root, "box", at)["code"] == "" and _in_engine_order(root), "after a move to %s the order follows the engine rule" % [at])
	_expect(_near(box.position, Runtime.project(data["camera"], 4.2, 1.3, 0.0), 1e-4), "a moved actor follows `at`")
	_expect(Runtime.add_actor(root, "hero", [1, 1, 1], [0, 0])["code"] == "E_ACTOR", "a duplicate actor id is E_ACTOR")
	_expect(Runtime.move_actor(root, "nobody", [0, 0])["code"] == "E_ACTOR", "moving an unknown actor is E_ACTOR")
	_expect(Runtime.remove_actor(root, "nobody")["code"] == "E_ACTOR", "removing an unknown actor is E_ACTOR")
	_expect(Runtime.remove_actor(root, "hero")["code"] == "" and Runtime._actor(root, "hero") == null and Runtime.move_actor(root, "hero", [0, 0])["code"] == "E_ACTOR", "a removed actor is gone")
	_expect(Runtime.add_actor(root, "hero", [0.4, 0.4, 1.7], [1, 1])["code"] == "", "an id can be used again after removal")
	root.free()


## Children keys never decrease, and on equal keys scene sprites come before actors.
func _in_engine_order(root: Node2D) -> bool:
	var previous := -INF
	var actor_seen := false
	for node in root.get_node("Sprites").get_children():
		var key := float(node.get_meta("key"))
		if key < previous:
			return false
		if key > previous:
			actor_seen = false
		if node.has_meta("object") and actor_seen:
			return false
		actor_seen = actor_seen or node.has_meta("actor")
		previous = key
	return true


## Actors on a sprite's key: after that sprite, before the next larger key; equal actors in the order added.
func _actor_ties(data: Dictionary) -> void:
	var root: Node2D = Runtime.build(data)["root"]
	var order := _order(root)
	var target: Array = order[int(order.size() / 2.0)]
	var sprite: Dictionary = {}
	for object in data["objects"]:
		if object["id"] == target[0]:
			sprite = object["sprites"][target[1]]
	var f: Array = sprite["footprint"]
	var at := [(float(f[0]) + float(f[2])) / 2.0, (float(f[1]) + float(f[3])) / 2.0]
	var tie := float(target[2])
	Runtime.add_actor(root, "first", [0.4, 0.4, 1.7], at)
	Runtime.add_actor(root, "second", [0.2, 0.2, 1.0], at)
	Runtime.add_actor(root, "behind", [0.4, 0.4, 1.7], [at[0] - 0.5, at[1]])
	_expect(Runtime._actor(root, "first").get_meta("key") == tie, "an actor on the center of a sprite's footprint has the sprite's key %s" % tie)
	var keys: Array = _order(root).map(func(e: Array) -> Variant: return e[e.size() - 1])
	var ids: Array = _order(root).map(func(e: Array) -> Variant: return e[0])
	var last_sprite := keys.rfind(tie) - 2
	_expect(ids.slice(last_sprite + 1, last_sprite + 3) == ["first", "second"], "both actors come after every sprite of key %s, in the order added: %s" % [tie, ids])
	_expect(last_sprite + 3 == keys.size() or float(keys[last_sprite + 3]) > tie, "the next child has a larger key")
	_expect(_in_engine_order(root), "the whole list follows the engine rule")
	Runtime.move_actor(root, "first", [at[0] + 3.0, at[1]])
	Runtime.move_actor(root, "first", at)
	ids = _order(root).map(func(e: Array) -> Variant: return e[0])
	_expect(ids.find("first") + 1 == ids.find("second"), "a moved actor keeps its place before an actor added later on the same key")
	Runtime.remove_actor(root, "first")
	Runtime.add_actor(root, "first", [0.4, 0.4, 1.7], at)
	ids = _order(root).map(func(e: Array) -> Variant: return e[0])
	_expect(ids.find("second") + 1 == ids.find("first"), "an actor added again comes after the actors already there")
	root.free()


func _errors(data: Dictionary) -> void:
	for old in ["isoblock-runtime/1", "isoblock-runtime/3", ""]:
		var wrong := data.duplicate(true)
		wrong["schema"] = old
		var built := Runtime.build(wrong)
		_expect(built["code"] == "E_SCHEMA" and built["root"] == null and built["unmapped"] == [], "the schema value '%s' is E_SCHEMA and builds nothing" % old)
	for key in ["states", "objects", "cameraDir"]:
		var missing := data.duplicate(true)
		missing.erase(key)
		_expect(Runtime.build(missing)["code"] == "E_SCHEMA", "a file without '%s' is E_SCHEMA" % key)
	var no_sprites := data.duplicate(true)
	no_sprites["objects"][0].erase("sprites")
	_expect(Runtime.build(no_sprites)["code"] == "E_SCHEMA", "an object without sprites is E_SCHEMA")
	var twice := data.duplicate(true)
	twice["objects"].append(twice["objects"][0].duplicate(true))
	var r := Runtime.build(twice)
	_expect(r["code"] == "E_DUPLICATE_ID" and r["root"] == null, "a duplicate object id is E_DUPLICATE_ID and builds nothing")
	var anchors := data.duplicate(true)
	for object in anchors["objects"]:
		if object["anchors"].size() > 0:
			object["anchors"].append(object["anchors"][0].duplicate(true))
			break
	_expect(Runtime.build(anchors)["code"] == "E_DUPLICATE_ID", "a duplicate anchor id is E_DUPLICATE_ID")
	# E_Z_RANGE is gone: the draw order is the child order, so any number of parts fits.
	var many := data.duplicate(true)
	var parts: Array = []
	var pieces: Array = []
	for i in RenderingServer.CANVAS_ITEM_Z_MAX + 2:
		parts.append({ "id": "p%d" % i, "box": [0, 0, 0, 1, 1, 1], "order": i })
		pieces.append({ "part": "p%d" % i, "box": [0, 0, 0, 1, 1, 1] })
	many["objects"] = [{ "id": "a", "type": "t", "rot": 0, "tags": [], "footprint": [0, 0, 1, 1], "anchors": [], "parts": parts, "sprites": [{ "key": 2, "footprint": [0, 0, 1, 1], "pieces": pieces }] }]
	var big := Runtime.build(many)
	_expect(big["code"] == "" and big["root"].get_node("Sprites").get_child(0).get_child_count() == 3 * pieces.size(), "%d parts in one object build" % parts.size())
	big["root"].free()
	_expect(Runtime.load_file("res://does-not-exist.json")["code"] == "E_IO", "a missing file is E_IO")
	var bad := FileAccess.open("user://bad.json", FileAccess.WRITE)
	bad.store_string("[1, 2")
	bad.close()
	_expect(Runtime.load_file("user://bad.json")["code"] == "E_JSON_PARSE", "malformed JSON is E_JSON_PARSE")
