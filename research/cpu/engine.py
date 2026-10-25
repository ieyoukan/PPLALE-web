"""Use the actual TypeScript engine from Python over local JSON-lines pipes."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess


class Engine:
    def __init__(self, *, node: str = "node", root: str | Path | None = None):
        self.root = Path(root) if root is not None else Path(__file__).resolve().parents[2]
        script = self.root / "packages/game-core/scripts/gameplay.mjs"
        self.process = subprocess.Popen([node, str(script)], cwd=self.root, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
        self.serial = 0

    def request(self, op: str, **params):
        self.serial += 1
        self.process.stdin.write(json.dumps({**params, "id": self.serial, "op": op}, allow_nan=False) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(f"Engine exited; build game-core first. {self.process.stderr.read()}")
        response = json.loads(line)
        if response.get("id") != self.serial:
            raise RuntimeError("Engine response does not match request")
        if not response.get("ok"):
            raise ValueError(response.get("error", "Engine rejected request"))
        return response["result"]

    def describe(self, section: str | None = None, *, card_id: str | None = None):
        options = {}
        if section is not None:
            options["section"] = section
        if card_id is not None:
            options["cardId"] = card_id
        return self.request("describe", **options)

    def new(self, *, seed: int = 1, viewer: int = 0, decks=None, rules=None):
        options = {"seed": seed, "viewer": viewer}
        if decks is not None:
            options["decks"] = decks
        if rules is not None:
            options["rules"] = rules
        return self.request("new", **options)

    def observe(self, viewer: int = 0):
        return self.request("observe", viewer=viewer)

    def inspect(self, viewer: int = 0):
        return self.request("inspect", viewer=viewer)

    def act(self, decision: dict, action_id: str):
        return self.request("act", viewer=decision["viewer"], decisionId=decision["decisionId"], actionId=action_id)

    def cpu(self, *, viewer: int = 0, actor: int | None = None, level: str = "normal"):
        options = {"viewer": viewer, "level": level}
        if actor is not None:
            options["actor"] = actor
        return self.request("cpu", **options)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if not stream.closed:
                stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
