import { spawn } from "node:child_process";

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Opening a browser is a convenience; the URL is printed either way.
  }
}

export async function start(app, { port = 3000, open = true } = {}) {
  let server = null;
  let lastError = null;

  for (let candidate = port; candidate < port + 20 && !server; candidate += 1) {
    try {
      server = await listen(app, candidate);
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE") throw error;
    }
  }

  if (!server) throw lastError || new Error("No free port available.");

  const url = `http://localhost:${server.address().port}`;
  console.log("");
  console.log("  Decklist Printer");
  console.log(`  ${url}`);
  console.log("");
  console.log("  Leave this window open while you use it.");
  console.log("  Close it (or press Ctrl+C) when you are done.");
  console.log("");

  if (open) openBrowser(url);
  return { server, url };
}
