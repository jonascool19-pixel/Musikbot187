#!/usr/bin/env python3
import grp
import os
import socket
import subprocess

SOCKET = '/run/radiobot-privileged.sock'
ALLOWED = {'bot-restart', 'bot-update', 'server-reboot', 'server-shutdown', 'config-write'}
MAX_REQUEST = 16 * 1024


def main() -> None:
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass

    socket_group = grp.getgrnam('radiobot')
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET)
    os.chmod(SOCKET, 0o660)
    os.chown(SOCKET, 0, socket_group.gr_gid)
    server.listen(8)

    while True:
        conn, _ = server.accept()
        with conn:
            try:
                data = conn.recv(MAX_REQUEST).decode('utf-8', 'strict')
            except UnicodeDecodeError:
                conn.sendall(b'ERR invalid-encoding\n')
                continue
            command, _, payload = data.partition('\n')
            command = command.strip()
            if command not in ALLOWED:
                conn.sendall(b'ERR invalid-command\n')
                continue
            if command == 'config-write':
                if not payload.strip() or len(payload.encode('utf-8')) > MAX_REQUEST:
                    conn.sendall(b'ERR invalid-config\n')
                    continue
                try:
                    result = subprocess.run(
                        ['/usr/local/sbin/radiobot-configure'],
                        input=payload,
                        text=True,
                        capture_output=True,
                        timeout=15,
                        check=False,
                    )
                except Exception:
                    conn.sendall(b'ERR config-helper-failed\n')
                    continue
                if result.returncode != 0:
                    conn.sendall(b'ERR config-rejected\n')
                    continue
                conn.sendall(b'OK\n')
                continue
            if command == 'bot-restart':
                subprocess.Popen(['/usr/bin/systemctl', 'restart', 'radiobot.service'])
            elif command == 'bot-update':
                subprocess.Popen(['/usr/local/sbin/radiobot-update'])
            elif command == 'server-reboot':
                subprocess.Popen(['/usr/bin/systemctl', 'reboot'])
            else:
                subprocess.Popen(['/usr/bin/systemctl', 'poweroff'])
            conn.sendall(b'OK\n')


if __name__ == '__main__':
    main()
