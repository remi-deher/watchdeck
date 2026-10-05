"""Binary loopback socket relay over an ordinary SSH exec channel."""

import json
import os
import select
import socket
import sys
import time


def relay():
    body = json.loads(sys.stdin.buffer.readline())
    listener = None
    stream = None
    try:
        if body["listen"]:
            listener = socket.socket()
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            listener.settimeout(30)
            print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
            stream, _ = listener.accept()
        else:
            stream = socket.create_connection(("127.0.0.1", int(body["port"])), timeout=10)
        stream.settimeout(None)
        deadline = time.monotonic() + 28800
        while time.monotonic() < deadline:
            ready, _, _ = select.select([stream, sys.stdin.buffer], [], [], 1)
            for current in ready:
                data = stream.recv(65536) if current is stream else os.read(sys.stdin.fileno(), 65536)
                if not data:
                    return
                if current is stream:
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                else:
                    stream.sendall(data)
    finally:
        if stream is not None:
            stream.close()
        if listener is not None:
            listener.close()


if __name__ == "__main__":
    relay()
