#!/usr/bin/env python3
import json
import os
import shutil
import time
from pathlib import Path

OUT = Path('/var/lib/radiobot/metrics.json')
OUT.parent.mkdir(parents=True, exist_ok=True)

def cpu_counters():
    line = Path('/proc/stat').read_text().splitlines()[0]
    vals = list(map(int, line.split()[1:]))
    return sum(vals), vals[3]

def memory():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        k, v = line.split(':', 1)
        values[k] = int(v.strip().split()[0]) * 1024
    total = values.get('MemTotal', 0)
    available = values.get('MemAvailable', values.get('MemFree', 0))
    return total, max(0, total - available)

def network():
    rx = tx = 0
    for line in Path('/proc/net/dev').read_text().splitlines()[2:]:
        if ':' not in line:
            continue
        iface, data = line.split(':', 1)
        if iface.strip() == 'lo':
            continue
        fields = data.split()
        if len(fields) >= 9:
            rx += int(fields[0])
            tx += int(fields[8])
    return rx, tx

def main():
    total, idle = cpu_counters()
    mem_total, mem_used = memory()
    rx, tx = network()
    disk = shutil.disk_usage('/opt/radiobot')
    payload = {
        'ts': int(time.time() * 1000),
        'cpuTotal': total,
        'cpuIdle': idle,
        'cpuCount': os.cpu_count() or 1,
        'load1': os.getloadavg()[0],
        'memoryTotal': mem_total,
        'memoryUsed': mem_used,
        'diskTotal': disk.total,
        'diskUsed': disk.used,
        'networkRx': rx,
        'networkTx': tx,
    }
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    tmp.chmod(0o600)
    os.replace(tmp, OUT)

if __name__ == '__main__':
    main()
