## Draws a runtime file with the adapter and writes what the cross-check of SPEC 13.6 compares.
##
## godot --script res://test/cross_check.gd -- --runtime FILE --out DIR
##
## Every object gets its own flat color, from its number in the file: object i (counted from 1) is
## drawn with red = i / 256 and green = i % 256, so a pixel tells which object it shows.
## Writes in DIR:
##   frame.png   the whole frame (the check also compares two runs byte for byte);
##   frame.rgba  the same pixels, 4 bytes each, rows from the top;
##   alone.json  per object, in file order, the box of its pixels when every other object is
##               hidden: [x0, y0, x1, y1] from the first to one past the last pixel, or null.
extends SceneTree

const Runtime := preload("res://isoblock_runtime.gd")
const Args := preload("res://test/args.gd")


func _initialize() -> void:
	var args := Args.parse()
	var loaded := Runtime.load_file(args["runtime"])
	if loaded["code"] != "":
		quit(2)
		return
	var data: Dictionary = loaded["data"]
	var numbers := {}
	for i in data["objects"].size():
		numbers[data["objects"][i]["id"]] = i + 1
	var built := Runtime.build(data, func(object: Dictionary) -> Color: return _color(numbers[object["id"]]))
	if built["code"] != "":
		quit(2)
		return
	var viewport := SubViewport.new()
	viewport.size = Vector2i(int(data["frame"]["w"]), int(data["frame"]["h"]))
	viewport.transparent_bg = true
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	root.add_child(viewport)
	viewport.add_child(built["root"])
	await process_frame
	DirAccess.make_dir_recursive_absolute(args["out"])

	var image := await _capture(viewport)
	image.save_png("%s/frame.png" % args["out"])
	var raw := FileAccess.open("%s/frame.rgba" % args["out"], FileAccess.WRITE)
	raw.store_buffer(image.get_data())
	raw.close()

	var objects: Node = built["root"].get_node("Objects")
	var alone: Array = []
	for i in objects.get_child_count():
		for k in objects.get_child_count():
			objects.get_child(k).visible = k == i
		var rect := (await _capture(viewport)).get_used_rect()
		alone.append({ "id": data["objects"][i]["id"], "box": null if rect.size == Vector2i.ZERO else [rect.position.x, rect.position.y, rect.end.x, rect.end.y] })
	var out := FileAccess.open("%s/alone.json" % args["out"], FileAccess.WRITE)
	out.store_string(JSON.stringify(alone))
	out.close()
	quit(0)


func _color(number: int) -> Color:
	return Color8(number >> 8, number & 255, 0, 255)


## One RGBA8 image of the viewport, after it has drawn once.
func _capture(viewport: SubViewport) -> Image:
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	image.convert(Image.FORMAT_RGBA8)
	return image
