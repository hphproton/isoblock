## Draws a runtime file with the adapter and writes what the cross-checks of SPEC 13.6 compare.
##
## godot --script res://test/cross_check.gd -- --runtime FILE --case FILE --out DIR
##
## The case file is `{ "states": [...], "instantiate": [...] | null, "actor": { "size", "path" } | null }`
## (SPEC 17, Godot fixtures). Every object gets its own flat color, from its number in the file:
## object i (counted from 1) is drawn with red = i / 256 and green = i % 256, so a pixel tells which
## object it shows; the actor is number (objects + 1). Types listed in `instantiate` are drawn by
## instances of a scene made here: the faces of the parts of the first object of that type, in white,
## relative to its pivot, colored through `modulate`.
## Writes in DIR:
##   build.json           `{ "unmapped": [...] }` as `build` returned it;
##   step-K.png, .rgba    the whole frame after applying the K-th state of `states` (rgba: 4 bytes a
##                        pixel, rows from the top);
##   step-K.alone.json    per object, in file order, the box of its pixels when every other object is
##                        hidden: [x0, y0, x1, y1] from the first to one past the last pixel, or null;
##   actor-J.png, .rgba   the frame of the last state with the actor at the J-th point of its path.
extends SceneTree

const Runtime := preload("res://isoblock_runtime.gd")
const Args := preload("res://test/args.gd")

var numbers := {}


func _initialize() -> void:
	var args := Args.parse()
	var loaded := Runtime.load_file(args["runtime"])
	var spec: Variant = JSON.parse_string(FileAccess.get_file_as_string(args["case"]))
	if loaded["code"] != "" or typeof(spec) != TYPE_DICTIONARY:
		quit(2)
		return
	var data: Dictionary = loaded["data"]
	for i in data["objects"].size():
		numbers[data["objects"][i]["id"]] = i + 1
	var scenes := {}
	for type in (spec["instantiate"] if spec["instantiate"] != null else []):
		scenes[type] = _art(data, type)
	var built := Runtime.build(data, func(object: Dictionary) -> Color: return _color(numbers[object["id"]]), scenes)
	if built["code"] != "":
		quit(2)
		return
	_write("%s/build.json" % args["out"], JSON.stringify({ "unmapped": built["unmapped"] }))
	var top: Node2D = built["root"]
	_modulate(top)
	var viewport := SubViewport.new()
	viewport.size = Vector2i(int(data["frame"]["w"]), int(data["frame"]["h"]))
	viewport.transparent_bg = true
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	root.add_child(viewport)
	viewport.add_child(top)
	await process_frame
	DirAccess.make_dir_recursive_absolute(args["out"])

	var states: Array = spec["states"]
	for k in states.size():
		if Runtime.apply_state(top, states[k] if states[k] != null else "")["code"] != "":
			quit(2)
			return
		_save(await _capture(viewport), "%s/step-%d" % [args["out"], k])
		_write("%s/step-%d.alone.json" % [args["out"], k], JSON.stringify(await _alone(viewport, top, data)))

	var actor: Variant = spec["actor"]
	if actor != null:
		var path: Array = actor["path"]
		Runtime.add_actor(top, "isoblock-actor", actor["size"], path[0], null, _color(data["objects"].size() + 1))
		for j in path.size():
			if Runtime.move_actor(top, "isoblock-actor", path[j])["code"] != "":
				quit(2)
				return
			_save(await _capture(viewport), "%s/actor-%d" % [args["out"], j])
	quit(0)


func _color(number: int) -> Color:
	return Color8(number >> 8, number & 255, 0, 255)


## A scene that draws, in white, the faces of the parts of the first object of `type`, relative to
## that object's pivot: what a game's art for the type would show.
func _art(data: Dictionary, type: String) -> PackedScene:
	var art := Node2D.new()
	art.name = type
	for object in data["objects"]:
		if object["type"] != type:
			continue
		var f: Array = object["footprint"]
		var pivot := Runtime.project(data["camera"], (f[0] + f[2]) / 2.0, (f[1] + f[3]) / 2.0, 0.0)
		var parts: Array = object["parts"].duplicate()
		parts.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["order"] < b["order"])
		for part in parts:
			for face in Runtime.faces(data["camera"], data["cameraDir"], part["box"]):
				var polygon := Polygon2D.new()
				polygon.polygon = Transform2D(0.0, -pivot) * face
				polygon.antialiased = false
				art.add_child(polygon)
				polygon.owner = art
		break
	var packed := PackedScene.new()
	packed.pack(art)
	art.free()
	return packed


## Give every instance its object's color through `modulate`.
func _modulate(node: Node) -> void:
	for child in node.get_children():
		if child.has_meta("type") and child.has_meta("slice"):
			child.modulate = _color(numbers[child.get_meta("object")])
		_modulate(child)


## The pixel box of each object alone: only its sprites shown, when the state shows them.
func _alone(viewport: SubViewport, top: Node2D, data: Dictionary) -> Array:
	var sprites := top.get_node("Sprites").get_children()
	var shown := sprites.map(func(n: Node) -> bool: return n.visible)
	var out: Array = []
	for object in data["objects"]:
		for i in sprites.size():
			sprites[i].visible = shown[i] and sprites[i].get_meta("object") == object["id"]
		var rect := (await _capture(viewport)).get_used_rect()
		out.append({ "id": object["id"], "box": null if rect.size == Vector2i.ZERO else [rect.position.x, rect.position.y, rect.end.x, rect.end.y] })
	for i in sprites.size():
		sprites[i].visible = shown[i]
	return out


func _save(image: Image, base: String) -> void:
	image.save_png("%s.png" % base)
	var raw := FileAccess.open("%s.rgba" % base, FileAccess.WRITE)
	raw.store_buffer(image.get_data())
	raw.close()


func _write(path: String, text: String) -> void:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var out := FileAccess.open(path, FileAccess.WRITE)
	out.store_string(text)
	out.close()


## One RGBA8 image of the viewport, after it has drawn once.
func _capture(viewport: SubViewport) -> Image:
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	image.convert(Image.FORMAT_RGBA8)
	return image
