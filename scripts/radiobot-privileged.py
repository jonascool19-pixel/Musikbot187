#!/usr/bin/env python3
import os
import socket
import subprocess

SOCKET = '/run/radiobot-privileged.sock'
ALLOWED = {'bot-restart', 'bot-update', 'server-reboot', 'server-shutdown'}

def main() -> None:
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET)
    os.chmod(SOCKET, 0o660)
    try:
        import grp
        os.chown(SOCKET, 0, grp.getgrnam('radiobot-ops').gr_gid)
    except Exception:
        pass
    server.listen(8)
    while True:
        conn, _ = server.accept()
        with conn:
            try:
                data = conn.recv(128).decode('utf-8', 'strict').strip()
            except UnicodeDecodeError:
                data = ''
            if data not in ALLOWED:
                conn.sendall(b'ERR invalid-command\n')
                continue
            if data == 'bot-restart':
                subprocess.Popen(['/usr/bin/systemctl', 'restart', 'radiobot.service'])
            elif data == 'bot-update':
                subprocess.Popen(['/usr/local/sbin/radiobot-update'])
            elif data == 'server-reboot':
                subprocess.Popen(['/usr/bin/systemctl', 'reboot'])
            else:
                subprocess.Popen(['/usr/bin/systemctl', 'poweroff'])
            conn.sendall(b'OK\n')

if __name__ == '__main__':
    main()
