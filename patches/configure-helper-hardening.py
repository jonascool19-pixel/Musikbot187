#!/usr/bin/env python3
from pathlib import Path
import os
import shutil

ROOT = Path('/opt/radiobot')
source = ROOT / 'scripts/radiobot-configure.py'
target = Path('/usr/local/sbin/radiobot-configure')

if source.exists():
    target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    shutil.copy2(source, target)
    os.chown(target, 0, 0)
    target.chmod(0o755)
    print('installed tracked configure helper')
    raise SystemExit(0)

if not target.exists():
    raise SystemExit('configure helper source missing')

print('using existing configure helper')
