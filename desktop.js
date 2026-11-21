import html from "./public/index.html" with { type: "text" };
import { createApp } from "./app.js";
import { start } from "./launch.js";

start(createApp({ html }), { open: true });
