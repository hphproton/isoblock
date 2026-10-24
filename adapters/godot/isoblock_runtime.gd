## IsoBlock adapter for Godot 4.7. Reads isoblock-runtime/3 and builds a Node2D tree (SPEC 13.8).

class_name IsoblockRuntime
extends RefCounted

const SCHEMA := "isoblock-runtime/3"
const EPS := 1e-9
const DEFAULT_COLOR := Color(0.6, 0.6, 0.6)

static func load_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _fail("E_IO", "cannot read %s" % path)
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(data) != TYPE_DICTIONARY:
		return _fail("E_JSON_PARSE", "%s is not a JSON object" % path)
	return { "data": data, "code": "", "message": "" }

static func project(camera: Dictionary, u: float, v: float, h: float) -> Vector2:
	var axes := _axes(camera)
	var origin := Vector2(camera["origin"][0], camera["origin"][1])
	return origin + u * axes[0] + v * axes[1] + h * axes[2]

static func unproject(camera: Dictionary, p: Vector2, h: float = 0.0) -> Vector2:
	var axes := _axes(camera)
	var origin := Vector2(camera["origin"][0], camera["origin"][1])
	return _solve(axes[0], axes[1], p - origin - h * axes[2])

static func camera_direction(camera: Dictionary) -> Vector3:
	var c := order_direction(camera)
	return Vector3(c[0], c[1], c[2])

static func order_direction(camera: Dictionary) -> Array:
	if camera.has("elevation"):
		var el := float(camera["elevation"])
		if el >= 90.0 - 1e-9:
			return [0.0, 0.0, 1.0]
		var dir := deg_to_rad(float(camera.get("direction", 45.0)))
		var cot := 1.0 / tan(deg_to_rad(el))
		return [_round(cot * cos(dir), 1e9), _round(cot * sin(dir), 1e9), 1.0]
	var px := float(camera["pxPerUnit"])
	var ux := px * cos(deg_to_rad(float(camera["angleU"])))
	var uy := px * sin(deg_to_rad(float(camera["angleU"])))
	var vx := px * cos(deg_to_rad(float(camera["angleV"])))
	var vy := px * sin(deg_to_rad(float(camera["angleV"])))
	var up := px * float(camera.get("verticalScale", 1.0))
	var det := ux * vy - uy * vx
	return [_round(-up * vx / det, 1e9), _round(ux * up / det, 1e9), 1.0]

static func sort_key(dir: Array, footprint: Array, base: float = 0.0) -> float:
	var sum := float(dir[0]) * (float(footprint[0]) + float(footprint[2])) + float(dir[1]) * (float(footprint[1]) + float(footprint[3]))
	return _round(sum + 2.0 * base, 1e6)

static func check(data: Dictionary) -> Dictionary:
	if data.get("schema") != SCHEMA:
		return _fail("E_SCHEMA", "unsupported schema '%s', expected '%s'" % [data.get("schema"), SCHEMA])
	for key in ["scene", "camera", "projection", "cameraDir", "frame", "objects", "zones", "lanes", "states"]:
		if not data.has(key):
			return _fail("E_SCHEMA", "missing key '%s'" % key)
	for group in [data["objects"], data["zones"], data["lanes"]]:
		var duplicate := _first_duplicate(group)
		if duplicate != "":
			return _fail("E_DUPLICATE_ID", "duplicate id '%s'" % duplicate)
	for object in data["objects"]:
		if not object.has("sprites"):
			return _fail("E_SCHEMA", "object '%s' has no sprites" % object["id"])
		for list in [object["parts"], object["anchors"]]:
			var duplicate := _first_duplicate(list)
			if duplicate != "":
				return _fail("E_DUPLICATE_ID", "duplicate id '%s' in object '%s'" % [duplicate, object["id"]])
	return _done()

static func build(data: Dictionary, color_of: Callable = Callable(), scenes: Dictionary = {}) -> Dictionary:
	var problem := check(data)
	if problem["code"] != "":
		return { "root": null, "code": problem["code"], "message": problem["message"], "unmapped": [] }
	var camera: Dictionary = data["camera"].duplicate()
	camera["projection"] = data["projection"]
	var root := Node2D.new()
	root.name = data["scene"]
	for key in ["scene", "meta", "camera", "cameraDir", "states"]:
		root.set_meta(key, data.get(key))
	root.set_meta("actors_added", 0)
	var objects := _container(root, "Objects")
	var sprites := _container(root, "Sprites")
	var unmapped: Array = []
	var order: Array = []
	for object in data["objects"]:
		objects.add_child(_object_node(camera, object))
		var scene: PackedScene = scenes.get(object["type"])
		if scene == null and not scenes.is_empty() and not unmapped.has(object["type"]):
			unmapped.append(object["type"])
		var color: Color = color_of.call(object) if color_of.is_valid() else DEFAULT_COLOR
		for k in object["sprites"].size():
			var node := _sprite_node(camera, data["cameraDir"], object, k, scene, color)
			order.append([float(object["sprites"][k]["key"]), order.size(), node])
	# The engine rule: ascending key; equal keys keep the order of the sprite list.
	order.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	for entry in order:
		sprites.add_child(entry[2])
	var zones := _container(root, "Zones")
	for zone in data["zones"]:
		zones.add_child(_zone_node(camera, zone))
	var lanes := _container(root, "Lanes")
	for lane in data["lanes"]:
		lanes.add_child(_lane_node(camera, lane))
	return { "root": root, "code": "", "message": "", "unmapped": unmapped }

static func apply_state(root: Node2D, name: String) -> Dictionary:
	var states: Dictionary = root.get_meta("states")
	if name != "" and not states.has(name):
		return _fail("E_STATE", "unknown state '%s'" % name)
	var state: Dictionary = {} if name == "" else states[name]
	var hide := {}
	for id in state.get("hide", []):
		hide[id] = true
	var parts: Dictionary = state.get("hideParts", {})
	for node in root.get_node("Objects").get_children():
		var id: String = node.get_meta("id")
		var all: Array = node.get_meta("parts")
		var gone: Array = parts.get(id, [])
		var covered := all.size() > 0
		for part in all:
			if not gone.has(part):
				covered = false
		if covered:
			hide[id] = true
		node.visible = not hide.has(id)
	for node in root.get_node("Sprites").get_children():
		if node.has_meta("object"):
			var id: String = node.get_meta("object")
			node.visible = not hide.has(id)
			_show_parts(node, parts.get(id, []))
	root.set_meta("hidden_regions", [] if name == "" else state.get("hideRegions", []))
	return _done()

static func add_actor(root: Node2D, id: String, size: Variant, at: Variant, node: Node2D = null, color: Color = DEFAULT_COLOR) -> Dictionary:
	if _actor(root, id) != null:
		return _fail("E_ACTOR", "actor '%s' already exists" % id)
	var actor := Node2D.new()
	actor.name = "actor_%s" % id
	actor.set_meta("actor", id)
	actor.set_meta("size", [float(size[0]), float(size[1]), float(size[2])])
	actor.set_meta("added", root.get_meta("actors_added"))
	root.set_meta("actors_added", root.get_meta("actors_added") + 1)
	if node != null:
		node.position = Vector2.ZERO
		actor.add_child(node)
	else:
		var local: Dictionary = root.get_meta("camera").duplicate()
		local["origin"] = [0, 0]
		var w := float(size[0]) / 2.0
		var d := float(size[1]) / 2.0
		for face in faces(local, root.get_meta("cameraDir"), [-w, -d, 0.0, w, d, float(size[2])]):
			actor.add_child(_polygon(face, color))
	root.get_node("Sprites").add_child(actor)
	_place(root, actor, at)
	return _done()

static func move_actor(root: Node2D, id: String, at: Variant) -> Dictionary:
	var actor := _actor(root, id)
	if actor == null:
		return _fail("E_ACTOR", "unknown actor '%s'" % id)
	_place(root, actor, at)
	return _done()

static func remove_actor(root: Node2D, id: String) -> Dictionary:
	var actor := _actor(root, id)
	if actor == null:
		return _fail("E_ACTOR", "unknown actor '%s'" % id)
	actor.get_parent().remove_child(actor)
	actor.queue_free()
	return _done()

static func faces(camera: Dictionary, dir: Array, box: Array) -> Array[PackedVector2Array]:
	var all: Array[PackedVector2Array] = []
	var u: float = box[3] if dir[0] > 0.0 else box[0]
	var v: float = box[4] if dir[1] > 0.0 else box[1]
	if absf(dir[0]) > EPS:
		all.append(_quad(camera, [[u, box[1], box[2]], [u, box[4], box[2]], [u, box[4], box[5]], [u, box[1], box[5]]]))
	if absf(dir[1]) > EPS:
		all.append(_quad(camera, [[box[0], v, box[2]], [box[3], v, box[2]], [box[3], v, box[5]], [box[0], v, box[5]]]))
	all.append(_quad(camera, [[box[0], box[1], box[5]], [box[3], box[1], box[5]], [box[3], box[4], box[5]], [box[0], box[4], box[5]]]))
	var drawn: Array[PackedVector2Array] = []
	for face in all:
		if _area(face) > EPS:
			drawn.append(face)
	return drawn

static func _done() -> Dictionary:
	return { "code": "", "message": "" }

static func _fail(code: String, message: String) -> Dictionary:
	push_error("%s: %s" % [code, message])
	return { "code": code, "message": message }

static func _round(x: float, scale: float) -> float:
	return round(x * scale) / scale

static func _first_duplicate(list: Array) -> String:
	var seen := {}
	for item in list:
		if seen.has(item["id"]):
			return item["id"]
		seen[item["id"]] = true
	return ""

static func _show_parts(node: Node, gone: Array) -> void:
	for child in node.get_children():
		if child.has_meta("part"):
			child.visible = not gone.has(child.get_meta("part"))
		_show_parts(child, gone)

static func _axes(camera: Dictionary) -> Array[Vector2]:
	if camera.has("projection"):
		var p: Dictionary = camera["projection"]
		return [Vector2(p["axisU"][0], p["axisU"][1]), Vector2(p["axisV"][0], p["axisV"][1]), Vector2(p["up"][0], p["up"][1])]
	if camera.has("elevation"):
		var scale := float(camera["scale"])
		var el := deg_to_rad(float(camera["elevation"]))
		var dir := deg_to_rad(float(camera.get("direction", 45.0)))
		var s := sin(el)
		return [Vector2(sin(dir), s * cos(dir)) * scale, Vector2(-cos(dir), s * sin(dir)) * scale, Vector2(0.0, -scale * cos(el))]
	var px := float(camera["pxPerUnit"])
	var a := deg_to_rad(float(camera["angleU"]))
	var b := deg_to_rad(float(camera["angleV"]))
	return [Vector2(cos(a), sin(a)) * px, Vector2(cos(b), sin(b)) * px, Vector2(0.0, -px * float(camera.get("verticalScale", 1.0)))]

static func _solve(axis_u: Vector2, axis_v: Vector2, target: Vector2) -> Vector2:
	var det := axis_u.x * axis_v.y - axis_u.y * axis_v.x
	return Vector2((target.x * axis_v.y - target.y * axis_v.x) / det, (axis_u.x * target.y - axis_u.y * target.x) / det)

static func _container(root: Node2D, node_name: String) -> Node2D:
	var node := Node2D.new()
	node.name = node_name
	root.add_child(node)
	return node

static func _polygon(points: PackedVector2Array, color: Color) -> Polygon2D:
	var polygon := Polygon2D.new()
	polygon.polygon = points
	polygon.color = color
	polygon.antialiased = false
	return polygon

static func _object_node(camera: Dictionary, object: Dictionary) -> Node2D:
	var node := Node2D.new()
	node.name = object["id"]
	for key in ["id", "type", "rot", "tags", "footprint"]:
		node.set_meta(key, object[key])
	node.set_meta("base", object.get("base", 0.0))
	node.set_meta("parts", object["parts"].map(func(p: Dictionary) -> String: return p["id"]))
	for anchor in object["anchors"]:
		var marker := Marker2D.new()
		marker.name = anchor["id"]
		marker.position = project(camera, anchor["at"][0], anchor["at"][1], anchor["at"][2])
		marker.set_meta("kind", anchor.get("kind", ""))
		marker.set_meta("facing", anchor.get("facing", ""))
		node.add_child(marker)
	return node

static func _sprite_node(camera: Dictionary, dir: Array, object: Dictionary, k: int, scene: PackedScene, color: Color) -> Node2D:
	var sprite: Dictionary = object["sprites"][k]
	var node := Node2D.new()
	node.name = "%s_%d" % [object["id"], k]
	node.set_meta("object", object["id"])
	node.set_meta("key", sprite["key"])
	node.set_meta("slice", k)
	if scene == null:
		for piece in sprite["pieces"]:
			for face in faces(camera, dir, piece["box"]):
				var poly := _polygon(face, color)
				poly.set_meta("part", piece["part"])
				node.add_child(poly)
		return node
	var instance: Node2D = scene.instantiate()
	var f: Array = object["footprint"]
	var base := float(object.get("base", 0.0))
	instance.position = project(camera, (f[0] + f[2]) / 2.0, (f[1] + f[3]) / 2.0, base)
	for pair in [["object", object["id"]], ["type", object["type"]], ["rot", object["rot"]], ["slice", k]]:
		instance.set_meta(pair[0], pair[1])
	if object["sprites"].size() == 1:
		node.add_child(instance)
		return node
	var corners := PackedVector2Array()
	for piece in sprite["pieces"]:
		var b: Array = piece["box"]
		for i in 8:
			corners.append(project(camera, b[0] if i & 1 == 0 else b[3], b[1] if i & 2 == 0 else b[4], b[2] if i & 4 == 0 else b[5]))
	var hull := Geometry2D.convex_hull(corners)
	hull.remove_at(hull.size() - 1)  # convex_hull repeats the first point at the end
	var mask := _polygon(hull, Color.WHITE)
	mask.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	mask.add_child(instance)
	node.add_child(mask)
	return node

static func _actor(root: Node2D, id: String) -> Node2D:
	for node in root.get_node("Sprites").get_children():
		if node.has_meta("actor") and node.get_meta("actor") == id:
			return node
	return null

static func _place(root: Node2D, actor: Node2D, at: Variant) -> void:
	var u := _coordinate(at, 0)
	var v := _coordinate(at, 1)
	var h := _at_height(at)
	var size: Array = actor.get_meta("size")
	var key := sort_key(root.get_meta("cameraDir"), [u - size[0] / 2.0, v - size[1] / 2.0, u + size[0] / 2.0, v + size[1] / 2.0], h)
	actor.set_meta("key", key)
	actor.position = project(root.get_meta("camera"), u, v, h)
	var added: int = actor.get_meta("added")
	var index := 0
	for other in actor.get_parent().get_children():
		if other == actor:
			continue
		var other_key := float(other.get_meta("key"))
		if other_key < key or (other_key == key and (not other.has_meta("actor") or other.get_meta("added") < added)):
			index += 1
	actor.get_parent().move_child(actor, index)

static func _at_height(at: Variant) -> float:
	if at is Array:
		return float(at[2]) if at.size() >= 3 else 0.0
	if at is Vector3:
		return _coordinate(at, 2)
	return 0.0

static func _coordinate(at: Variant, i: int) -> float:
	var x := float(at[i])
	if at is Array:
		return x
	for digits in 10:
		var d := _round(x, pow(10.0, digits))
		if Vector2(d, 0.0).x == x:
			return d
	return x

static func _area(points: PackedVector2Array) -> float:
	var twice := 0.0
	for i in points.size():
		twice += points[i].cross(points[(i + 1) % points.size()])
	return absf(twice) / 2.0

static func _quad(camera: Dictionary, corners: Array) -> PackedVector2Array:
	var points := PackedVector2Array()
	for c in corners:
		points.append(project(camera, c[0], c[1], c[2]))
	return points

static func _zone_node(camera: Dictionary, zone: Dictionary) -> Polygon2D:
	var node := Polygon2D.new()
	node.name = zone["id"]
	node.visible = false
	var h := float(zone.get("h", 0.0))
	var points := _quad(camera, zone.get("points", []).map(func(p: Array) -> Array: return [p[0], p[1], h]))
	if _area(points) > EPS:
		node.polygon = points
	node.set_meta("id", zone["id"])
	node.set_meta("kind", zone.get("kind", ""))
	node.set_meta("points", zone.get("points", []))
	return node

static func _lane_node(camera: Dictionary, lane: Dictionary) -> Line2D:
	var node := Line2D.new()
	node.name = lane["id"]
	node.visible = false
	var fallback := float(lane.get("h", 0.0))
	node.points = _quad(camera, lane["points"].map(func(p: Array) -> Array: return [p[0], p[1], float(p[2]) if p.size() >= 3 else fallback]))
	for key in ["id", "width", "points"]:
		node.set_meta(key, lane[key])
	for key in ["kind", "dir"]:
		node.set_meta(key, lane.get(key, ""))
	return node
