## Command-line arguments of the test scripts: `-- --key value --key value`.
extends RefCounted


static func parse() -> Dictionary:
	var user := OS.get_cmdline_user_args()
	var out := {}
	var i := 0
	while i + 1 < user.size():
		out[user[i].trim_prefix("--")] = user[i + 1]
		i += 2
	return out
