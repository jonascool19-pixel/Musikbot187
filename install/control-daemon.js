#!/usr/bin/env node
import net from "node:net";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const SOCKET = process.env.MUSIKBOT187_CONTROL_SOCKET || "/run/musikbot187/control.sock";
const ALLOWED = new Set(["start-bot", "restart-bot", "stop-bot", "restart-system", "shutdown-system"]);
const COMMANDS = {
  "start-bot": ["/usr/bin/systemctl", ["start", "musikbot187"]],
  "restart-bot": ["/usr/bin/systemctl", ["restart", "musikbot187"]],
  "stop-bot": ["/usr/bin/systemctl", ["stop", "musikbot187"]],
  "restart-system": ["/usr/bin/systemctl", ["reboot"]],
  "shutdown-system": ["/usr/bin/systemctl", ["poweroff"]]
};

async function run(action) {
  if (!ALLOWED.has(action)) throw new Error("Ungültige Control-Aktion");
  const [command, args] = COMMANDS[action];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let error = "";
    child.stderr.on("data", data => { error += String(data).slice(-4000); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(error.trim() || `Control-Aktion fehlgeschlagen (${code})`)));
  });
}

await fs.mkdir("/run/musikbot187", { recursive: true });
try { await fs.unlink(SOCKET); } catch {}
const server = net.createServer(socket => {
  socket.setEncoding("utf8");
  let buffer = "";
  socket.on("data", async chunk => {
    buffer += chunk;
    if (buffer.length > 4096) { socket.destroy(); return; }
    const index = buffer.indexOf("\n");
    if (index < 0) return;
    const line = buffer.slice(0, index).trim();
    buffer = "";
    try {
      const request = JSON.parse(line);
      await run(String(request.action || ""));
      socket.end(JSON.stringify({ ok: true }) + "\n");
    } catch (error) {
      socket.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    }
  });
});
server.listen(SOCKET);
server.once("listening", async () => {
  await fs.chmod(SOCKET, 0o660);
  try { await fs.chown(SOCKET, Number(process.env.MUSIKBOT187_UID || 0), Number(process.env.MUSIKBOT187_GID || 0)); } catch {}
});
