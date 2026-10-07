## Tests of the adapter: golden vectors, the node tree and the reported errors.
## Run by `npm run test:godot`: godot --script res://test/adapter_test.gd -- --golden F --runtime F
extends SceneTree

const Runtime := preload("res://isoblock_runtime.gd")
const Args := preload("res://test/args.gd")
const TOLERANCE := 0.001

var checks := 0
var failures := 0


func _initialize() -> void:
	var args := Args.parse()
	_golden(JSON.parse_string(FileAccess.get_file_as_string(args["golden"])))
	var loaded := Runtime.load_file(args["runtime"])
	_expect(loaded["code"] == "", "the runtime file loads")
	var data: Dictionary = loaded["data"]
	_tree(data)
	_faces(data)
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


func _tree(data: Dictionary) -> void:
	var built := Runtime.build(data, func(object: Dictionary) -> Color: return Color.from_hsv(float(str(object["id"]).hash() % 360) / 360.0, 0.8, 0.9))
	_expect(built["code"] == "" and built["root"] != null, "build succeeds")
	var root: Node2D = built["root"]
	_expect(root.get_children().map(func(n: Node) -> String: return n.name) == ["Objects", "Zones", "Lanes"], "root has Objects, Zones and Lanes")
	var objects := root.get_node("Objects")
	_expect(objects.get_child_count() == data["objects"].size(), "one node per object")
	for object in data["objects"]:
		var node: Node2D = objects.get_node(NodePath(object["id"]))
		_expect(node.get_meta("type") == object["type"], "%s keeps its type" % object["id"])
		var colors := {}
		for part in object["parts"]:
			var part_node: Node2D = node.get_node(NodePath(part["id"]))
			_expect(part_node.z_index == int(part["order"]) and not part_node.z_as_relative, "%s/%s: absolute z_index = order" % [object["id"], part["id"]])
			for polygon in part_node.get_children():
				_expect(polygon is Polygon2D and not polygon.antialiased, "%s/%s: faces are Polygon2D without antialiasing" % [object["id"], part["id"]])
				colors[polygon.color] = true
		_expect(colors.size() <= 1, "%s: one flat color" % object["id"])
		for anchor in object["anchors"]:
			var marker: Marker2D = node.get_node(NodePath(anchor["id"]))
			var want := Runtime.project(data["camera"], anchor["at"][0], anchor["at"][1], anchor["at"][2])
			_expect(_near(marker.position, want, 1e-4), "%s/%s: marker at the projected anchor" % [object["id"], anchor["id"]])
			_expect(marker.get_meta("kind") == anchor.get("kind", "") and marker.get_meta("facing") == anchor.get("facing", ""), "%s/%s: kind and facing" % [object["id"], anchor["id"]])
	for zone in data["zones"]:
		var polygon: Polygon2D = root.get_node("Zones").get_node(NodePath(zone["id"]))
		_expect(not polygon.visible and polygon.get_meta("kind") == zone.get("kind", ""), "zone %s is hidden and keeps its kind" % zone["id"])
		_expect(polygon.polygon.size() == zone["points"].size(), "zone %s has its points" % zone["id"])
	for lane in data["lanes"]:
		var line: Line2D = root.get_node("Lanes").get_node(NodePath(lane["id"]))
		_expect(not line.visible and line.points.size() == lane["points"].size() and line.get_meta("width") == lane["width"], "lane %s is hidden and keeps its data" % lane["id"])
	root.free()


## Faces that point toward the camera: three for a diagonal camera, two when it is edge-on to one side.
func _faces(data: Dictionary) -> void:
	var camera: Dictionary = data["camera"]
	var box := [0.0, 0.0, 0.0, 1.0, 1.0, 1.0]
	var diagonal := _faces_of(data, [1.0, 1.0, 1.0], box)
	_expect(diagonal.size() == 3, "a diagonal camera shows three faces")
	var corners := PackedVector2Array([Runtime.project(camera, 0, 0, 1), Runtime.project(camera, 1, 0, 1), Runtime.project(camera, 1, 1, 1), Runtime.project(camera, 0, 1, 1)])
	_expect(diagonal.size() == 3 and diagonal[2] == corners, "the top face is the projected top of the box")
	var u_side := PackedVector2Array([Runtime.project(camera, 1, 0, 0), Runtime.project(camera, 1, 1, 0), Runtime.project(camera, 1, 1, 1), Runtime.project(camera, 1, 0, 1)])
	_expect(diagonal.size() == 3 and diagonal[0] == u_side, "the first face is the side at the high u")
	var behind := _faces_of(data, [-1.0, 1.0, 1.0], box)
	var low_u := PackedVector2Array([Runtime.project(camera, 0, 0, 0), Runtime.project(camera, 0, 1, 0), Runtime.project(camera, 0, 1, 1), Runtime.project(camera, 0, 0, 1)])
	_expect(behind.size() == 3 and behind[0] == low_u, "a camera on the other side shows the side at the low u")
	_expect(_faces_of(data, [0.0, 1.0, 1.0], box).size() == 2, "a camera edge-on to the u side shows two faces")
	_expect(_faces_of(data, [1.0, 1.0, 1.0], [0.0, 0.0, 0.0, 1.0, 1.0, 0.0]).size() == 1, "a box with no height draws only its top")


## The face polygons of one part with the given box, for the given camera direction.
func _faces_of(data: Dictionary, dir: Array, box: Array) -> Array:
	var one := {
		"schema": Runtime.SCHEMA, "scene": "t", "camera": data["camera"], "cameraDir": dir, "frame": data["frame"], "zones": [], "lanes": [],
		"objects": [{ "id": "a", "type": "t", "rot": 0, "tags": [], "footprint": [0, 0, 1, 1], "anchors": [], "parts": [{ "id": "p", "box": box, "order": 0 }] }],
	}
	var built := Runtime.build(one)
	var faces: Array = built["root"].get_node("Objects/a/p").get_children().map(func(n: Node) -> PackedVector2Array: return n.polygon)
	built["root"].free()
	return faces


func _errors(data: Dictionary) -> void:
	var wrong := data.duplicate(true)
	wrong["schema"] = "isoblock-runtime/2"
	var r := Runtime.build(wrong)
	_expect(r["code"] == "E_SCHEMA" and r["root"] == null, "a wrong schema value is E_SCHEMA and builds nothing")
	var twice := data.duplicate(true)
	twice["objects"].append(twice["objects"][0].duplicate(true))
	r = Runtime.build(twice)
	_expect(r["code"] == "E_DUPLICATE_ID" and r["root"] == null, "a duplicate object id is E_DUPLICATE_ID and builds nothing")
	var anchors := data.duplicate(true)
	for object in anchors["objects"]:
		if object["anchors"].size() > 0:
			object["anchors"].append(object["anchors"][0].duplicate(true))
			break
	_expect(Runtime.build(anchors)["code"] == "E_DUPLICATE_ID", "a duplicate anchor id is E_DUPLICATE_ID")
	var parts := data.duplicate(true)
	var many: Array = []
	for i in RenderingServer.CANVAS_ITEM_Z_MAX + 2:
		many.append({ "id": "p%d" % i, "box": [0, 0, 0, 1, 1, 1], "order": i })
	parts["objects"] = [{ "id": "a", "type": "t", "rot": 0, "tags": [], "footprint": [0, 0, 1, 1], "anchors": [], "parts": many }]
	_expect(Runtime.build(parts)["code"] == "E_Z_RANGE", "more parts than the z_index range holds is E_Z_RANGE")
	_expect(Runtime.load_file("res://does-not-exist.json")["code"] == "E_IO", "a missing file is E_IO")
	var bad := FileAccess.open("user://bad.json", FileAccess.WRITE)
	bad.store_string("[1, 2")
	bad.close()
	_expect(Runtime.load_file("user://bad.json")["code"] == "E_JSON_PARSE", "malformed JSON is E_JSON_PARSE")
