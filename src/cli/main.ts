#!/usr/bin/env node
import { nodeIo } from "./nodeIo";
import { run } from "./run";

process.exitCode = run(process.argv.slice(2), nodeIo);
