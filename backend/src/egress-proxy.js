import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns/promises";

function blocked4(ip) {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]);
  return [[0,16777215],[167772160,184549375],[16777344,16842751],[2130706432,2147483647],[2851995648,2852061183],[2886729728,2887778303],[3221225472,3221225727],[3232235520,3232301055],[3323068416,3323199487],[3325256704,3325256959],[3405803776,3405804031]].some(([a,b]) => n >= a && n <= b);
}
function blocked(ip) {
  const family = net.isIP(ip); if (family === 4) return blocked4(ip); if (family !== 6) return true;
  const v = ip.toLowerCase().split('%')[0]; return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('::ffff:');
}
async function resolvePublic(host) {
  const name = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!name || name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')) throw new Error('Proxy-Ziel ist nicht erlaubt');
  if (net.isIP(name)) { if (blocked(name)) throw new Error('Proxy-Ziel ist nicht erlaubt'); return name; }
  const rows = await dns.lookup(name, { all: true, verbatim: true }); if (!rows.length || rows.some(x => blocked(x.address))) throw new Error('Proxy-Ziel ist nicht erlaubt'); return rows[0].address;
}
function parseConnectTarget(raw) {
  const value = String(raw || '');
  const bracketed = value.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketed) return { host: bracketed[1], port: Number(bracketed[2]) };
  const plain = value.match(/^([^:]+):(\d+)$/);
  if (plain) return { host: plain[1], port: Number(plain[2]) };
  return null;
}
export class EgressProxy {
  server = null; port = 0;
  async start() {
    if (this.server) return this;
    this.server = http.createServer((req,res) => { void this.request(req,res).catch(e => { res.writeHead(502); res.end(String(e?.message || 'Proxy-Fehler').slice(0,300)); }); });
    this.server.on('connect', (req,socket,head) => { void this.connect(req,socket,head).catch(() => { try { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); } catch {} }); });
    await new Promise((resolve,reject) => { this.server.once('error',reject); this.server.listen(0,'127.0.0.1',() => { this.port=this.server.address().port; resolve(); }); });
    return this;
  }
  get url() { return `http://127.0.0.1:${this.port}`; }
  async request(req,res) {
    const target = new URL(req.url); if (!["http:","https:"].includes(target.protocol) || target.username || target.password) throw new Error('Proxy-Protokoll nicht erlaubt');
    const ip = await resolvePublic(target.hostname); const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80)); const transport = target.protocol === 'https:' ? https : http;
    const headers = { ...req.headers, host: target.host }; delete headers['proxy-connection'];
    const up = transport.request({ hostname: ip, port, method: req.method, path: `${target.pathname || '/'}${target.search || ''}`, headers, servername: target.hostname, timeout: 15000 }, r => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    up.on('timeout', () => up.destroy(new Error('Proxy-Zeitüberschreitung'))); up.on('error', e => res.destroy(e)); req.pipe(up);
  }
  async connect(req,socket,head) {
    const parsed = parseConnectTarget(req.url); if (!parsed || parsed.port < 1 || parsed.port > 65535) throw new Error('Proxy-CONNECT-Ziel ungültig');
    const ip = await resolvePublic(parsed.host); const up = net.connect({ host: ip, port: parsed.port }); socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) up.write(head); socket.pipe(up); up.pipe(socket); const close=()=>{socket.destroy();up.destroy();}; socket.once('error',close); up.once('error',close);
  }
  async stop() { if (!this.server) return; const s=this.server; this.server=null; this.port=0; await new Promise(r => s.close(() => r())); }
}
