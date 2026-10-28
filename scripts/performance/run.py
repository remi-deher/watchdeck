"""Run the lot-0 profiles sequentially, without competing measurement processes."""

import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYTHON = sys.executable


def run(args, label):
    print(label, flush=True)
    with open("/tmp/watchdeck-lot0-" + label + ".log", "w") as log:
        subprocess.run(args, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)


def main():
    for profile in ["small", "large", "history"]:
        run([PYTHON, "scripts/performance/backend.py", "seed", "--profile", profile], profile + "-seed")
        with open("/tmp/watchdeck-lot0-" + profile + "-server.log", "w") as log:
            server = subprocess.Popen(
                [PYTHON, "scripts/performance/backend.py", "server"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT
            )
            try:
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError("Lab server exited")
                    try:
                        with urllib.request.urlopen("http://127.0.0.1:8765/__benchmark/stats", timeout=1) as response:
                            if response.status == 200:
                                break
                    except (urllib.error.URLError, TimeoutError):
                        time.sleep(0.1)
                else:
                    raise TimeoutError("Lab server startup")
                run([PYTHON, "scripts/performance/backend.py", "http", "--profile", profile], profile + "-http")
                if profile != "history":
                    run(["node", "scripts/performance/browser.mjs", profile], profile + "-browser")
                if profile == "large":
                    run(["node", "scripts/performance/interactions.mjs"], "large-interactions")
                if profile == "history":
                    run(["node", "scripts/performance/tables.mjs"], "history-tables")
                    run(["node", "scripts/performance/offline.mjs"], "history-offline")
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
        run([PYTHON, "scripts/performance/worker.py", profile], profile + "-worker")
        run([PYTHON, "scripts/performance/worker.py", profile, "--arq"], profile + "-arq")
    print("All profiles complete", flush=True)


if __name__ == "__main__":
    main()
