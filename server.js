import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { start } from "./launch.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "public", "index.html"), "utf8");

start(createApp({ html }), { open: process.env.NO_OPEN !== "1" });
