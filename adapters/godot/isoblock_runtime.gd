## IsoBlock adapter for Godot 4.7 (SPEC 13.3, 13.8).
##
## Reads a runtime file (`isoblock-runtime/2`, written by `isoblock export --target runtime`) and
## builds a Node2D tree with debug boxes. The adapter never edits the layout and never sorts:
## the draw order is the `order` of each part, used as an absolute `z_index`. The `sprites` of
## the objects and the `states` of the file are read but not used yet.
##
## Tree: root > Objects > object > part > face polygons; object > anchor markers;
## root > Zones > zone polygons (hidden); root > Lanes > lane lines (hidden).
##
## Errors are returned, not thrown: `{ "code": "E_...", "message": "..." }` (also printed with
## push_error), and nothing is built. `code` is empty on success.
class_name IsoblockRuntime
extends RefCounted

const SCHEMA := "isoblock-runtime/2"
const EPS := 1e-9
const DEFAULT_COLOR := Color(0.6, 0.6, 0.6)


## Read and parse a runtime file. Returns `{ "data": Dictionary, "code": String, "message": String }`.
static func load_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _fail("E_IO", "cannot read %s" % path)
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(data) != TYPE_DICTIONARY:
		return _fail("E_JSON_PARSE", "%s is not a JSON object" % path)
	return { "data": data, "code": "", "message": "" }


## Screen point of ground point (u, v) at height h (SPEC section 5).
static func project(camera: Dictionary, u: float, v: float, h: float) -> Vector2:
	var axes := _axes(camera)
	var origin := Vector2(camera["origin"][0], camera["origin"][1])
	return origin + u * axes[0] + v * axes[1] + h * axes[2]


## Ground point (u, v) under screen point p, on the plane at height h.
static func unproject(camera: Dictionary, p: Vector2, h: float = 0.0) -> Vector2:
	var axes := _axes(camera)
	var origin := Vector2(camera["origin"][0], camera["origin"][1])
	return _solve(axes[0], axes[1], p - origin - h * axes[2])


## Camera direction (cu, cv, 1): points on a line along it share one screen point.
static func camera_direction(camera: Dictionary) -> Vector3:
	var axes := _axes(camera)
	var c := _solve(axes[0], axes[1], -axes[2])
	return Vector3(c.x, c.y, 1.0)


## Check a runtime file: schema value, duplicate ids and the range of `z_index`.
static func check(data: Dictionary) -> Dictionary:
	if data.get("schema") != SCHEMA:
		return _fail("E_SCHEMA", "unsupported schema '%s', expected '%s'" % [data.get("schema"), SCHEMA])
	for key in ["scene", "camera", "cameraDir", "frame", "objects", "zones", "lanes"]:
		if not data.has(key):
			return _fail("E_SCHEMA", "missing key '%s'" % key)
	var parts := 0
	for group in [data["objects"], data["zones"], data["lanes"]]:
		var duplicate := _first_duplicate(group)
		if duplicate != "":
			return _fail("E_DUPLICATE_ID", "duplicate id '%s'" % duplicate)
	for object in data["objects"]:
		for list in [object["parts"], object["anchors"]]:
			var duplicate := _first_duplicate(list)
			if duplicate != "":
				return _fail("E_DUPLICATE_ID", "duplicate id '%s' in object '%s'" % [duplicate, object["id"]])
		parts += object["parts"].size()
	if parts > RenderingServer.CANVAS_ITEM_Z_MAX + 1:
		return _fail("E_Z_RANGE", "%d parts do not fit the z_index range 0..%d" % [parts, RenderingServer.CANVAS_ITEM_Z_MAX])
	return { "code": "", "message": "" }


## Build the node tree of a runtime file. `color_of` takes the object's Dictionary and returns
## the flat Color of its boxes. Returns `{ "root": Node2D, "code": String, "message": String }`;
## the root is not in a tree yet, and null on error.
static func build(data: Dictionary, color_of: Callable = Callable()) -> Dictionary:
	var problem := check(data)
	if problem["code"] != "":
		problem["root"] = null
		return problem
	var camera: Dictionary = data["camera"]
	var root := Node2D.new()
	root.name = data["scene"]
	root.set_meta("scene", data["scene"])
	root.set_meta("meta", data.get("meta", {}))
	var objects := _container(root, "Objects")
	for object in data["objects"]:
		var color: Color = color_of.call(object) if color_of.is_valid() else DEFAULT_COLOR
		objects.add_child(_object_node(camera, data["cameraDir"], object, color))
	var zones := _container(root, "Zones")
	for zone in data["zones"]:
		zones.add_child(_zone_node(camera, zone))
	var lanes := _container(root, "Lanes")
	for lane in data["lanes"]:
		lanes.add_child(_lane_node(camera, lane))
	return { "root": root, "code": "", "message": "" }


static func _fail(code: String, message: String) -> Dictionary:
	push_error("%s: %s" % [code, message])
	return { "code": code, "message": message }


static func _first_duplicate(list: Array) -> String:
	var seen := {}
	for item in list:
		if seen.has(item["id"]):
			return item["id"]
		seen[item["id"]] = true
	return ""


static func _axes(camera: Dictionary) -> Array[Vector2]:
	var px := float(camera["pxPerUnit"])
	var a := deg_to_rad(float(camera["angleU"]))
	var b := deg_to_rad(float(camera["angleV"]))
	return [Vector2(cos(a), sin(a)) * px, Vector2(cos(b), sin(b)) * px, Vector2(0.0, -px * float(camera.get("verticalScale", 1.0)))]


## Solve `a * axis_u + b * axis_v = target` for (a, b).
static func _solve(axis_u: Vector2, axis_v: Vector2, target: Vector2) -> Vector2:
	var det := axis_u.x * axis_v.y - axis_u.y * axis_v.x
	return Vector2((target.x * axis_v.y - target.y * axis_v.x) / det, (axis_u.x * target.y - axis_u.y * target.x) / det)


static func _container(root: Node2D, node_name: String) -> Node2D:
	var node := Node2D.new()
	node.name = node_name
	root.add_child(node)
	return node


static func _object_node(camera: Dictionary, dir: Array, object: Dictionary, color: Color) -> Node2D:
	var node := Node2D.new()
	node.name = object["id"]
	node.set_meta("id", object["id"])
	node.set_meta("type", object["type"])
	node.set_meta("rot", object["rot"])
	node.set_meta("tags", object["tags"])
	node.set_meta("footprint", object["footprint"])
	for part in object["parts"]:
		var part_node := Node2D.new()
		part_node.name = part["id"]
		part_node.set_meta("id", part["id"])
		part_node.z_as_relative = false
		part_node.z_index = int(part["order"])
		for face in _faces(camera, dir, part["box"]):
			var polygon := Polygon2D.new()
			polygon.polygon = face
			polygon.color = color
			polygon.antialiased = false
			part_node.add_child(polygon)
		node.add_child(part_node)
	for anchor in object["anchors"]:
		var marker := Marker2D.new()
		marker.name = anchor["id"]
		marker.position = project(camera, anchor["at"][0], anchor["at"][1], anchor["at"][2])
		marker.set_meta("kind", anchor.get("kind", ""))
		marker.set_meta("facing", anchor.get("facing", ""))
		node.add_child(marker)
	return node


## The faces of a box `[u0, v0, h0, u1, v1, h1]` that point toward the camera, as the display
## list draws them: the u side, the v side (when the camera is not edge-on) and the top.
static func _faces(camera: Dictionary, dir: Array, box: Array) -> Array[PackedVector2Array]:
	var faces: Array[PackedVector2Array] = []
	var u: float = box[3] if dir[0] > 0.0 else box[0]
	var v: float = box[4] if dir[1] > 0.0 else box[1]
	if absf(dir[0]) > EPS:
		faces.append(_quad(camera, [[u, box[1], box[2]], [u, box[4], box[2]], [u, box[4], box[5]], [u, box[1], box[5]]]))
	if absf(dir[1]) > EPS:
		faces.append(_quad(camera, [[box[0], v, box[2]], [box[3], v, box[2]], [box[3], v, box[5]], [box[0], v, box[5]]]))
	faces.append(_quad(camera, [[box[0], box[1], box[5]], [box[3], box[1], box[5]], [box[3], box[4], box[5]], [box[0], box[4], box[5]]]))
	var drawn: Array[PackedVector2Array] = []
	for face in faces:
		if _area(face) > EPS:
			drawn.append(face)
	return drawn


## Area of a simple polygon (shoelace); a face with none is edge-on and draws nothing.
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


static func _ground(camera: Dictionary, points: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in points:
		out.append(project(camera, p[0], p[1], 0.0))
	return out


static func _zone_node(camera: Dictionary, zone: Dictionary) -> Polygon2D:
	var node := Polygon2D.new()
	node.name = zone["id"]
	node.visible = false
	var points := _ground(camera, zone.get("points", []))
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
	node.points = _ground(camera, lane["points"])
	node.set_meta("id", lane["id"])
	node.set_meta("kind", lane.get("kind", ""))
	node.set_meta("dir", lane.get("dir", ""))
	node.set_meta("width", lane["width"])
	node.set_meta("points", lane["points"])
	return node
