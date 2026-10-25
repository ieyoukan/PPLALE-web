"""Order-invariant, fixed-width cards; exactly matches the TypeScript pooling contract."""
from __future__ import annotations

import math
import struct
try:
    from .dataset import encode_features
except ImportError:
    from dataset import encode_features

POOL_VERSION = "pplale-pooled-v1"


def f32(value):
    return struct.unpack("f", struct.pack("f", value))[0]


def flatten(data, specs):
    vector = encode_features(data, specs)
    return vector["values"] + list(map(int, vector["known"]))


def text_features(text, bins):
    chars, values, tokens = list(text)[:512], [0.0] * bins, 0
    for size in (2, 3):
        for i in range(len(chars) - size + 1):
            hashed = 2166136261
            for char in chars[i:i + size]:
                hashed = ((hashed ^ ord(char)) * 16777619) & 0xffffffff
            values[hashed % bins] += -1 if hashed & 0x80000000 else 1
            tokens += 1
    return [f32(value / math.sqrt(max(1, tokens))) for value in values]


def pool_spec(schema):
    return {"version": POOL_VERSION, "textBins": 24, "divisor": 7, "clip": 8,
            "zones": ["hand", "field", "nap", "exile", "choice"], "context": schema["context"], "player": schema["player"],
            "printed": [s for s in schema["card"] if s["path"][0] == "definition"],
            "current": [s for s in schema["card"] if s["path"][0] == "current"]}


class PoolEncoder:
    def __init__(self, catalog, spec):
        if spec["version"] != POOL_VERSION or spec["textBins"] != 24 or spec["divisor"] != 7 or spec["clip"] != 8 or spec["zones"] != ["hand", "field", "nap", "exile", "choice"]:
            raise ValueError("Unsupported pooling contract")
        self.catalog, self.spec, self.cache = catalog, spec, {}

    def describe(self, card_id):
        if card_id in self.cache:
            return self.cache[card_id]
        definition = None if card_id is None else self.catalog[card_id]
        effects = (definition or {}).get("effects", [])
        text = "" if definition is None else "\n".join([definition["effect"], definition["role"], *[s["name"] for s in definition["skills"]], (definition["passive"] or {}).get("name", "")])
        values = flatten({"definition": definition}, self.spec["printed"]) + text_features(text, self.spec["textBins"]) + [
            len(effects) / 5, sum(e.get("amount") or 0 for e in effects) / 10,
            sum(e.get("hp") or 0 for e in effects) / 10, 0 if (definition or {}).get("coverage") == "complete" else 1]
        self.cache[card_id] = values
        return values

    def __call__(self, observation):
        spec = self.spec
        vector = flatten(observation, spec["context"])
        width = len(self.describe(None)) + len(spec["current"]) * 2
        for side in (0, 1):
            p = observation["players"][side]
            vector += flatten(p, spec["player"]) + self.describe(p["playable"]) + [
                len(p["skills"]) / 10, sum(max(0, n or 0) for n in p["skills"]) / 10,
                sum(p["skillHistory"]) / 10, sum(s["uses"] for s in p["extraSkills"]) / 10]
            for zone in spec["zones"]:
                pool, count = [0.0] * width, 0
                for card in observation["cards"]:
                    if card["side"] == side and card["zone"] == zone:
                        row = self.describe(card["cardId"]) + flatten(card, spec["current"])
                        pool = [a + b for a, b in zip(pool, row)]
                        count += 1
                vector += [count / spec["divisor"]] + [v / spec["divisor"] for v in pool]
        return [f32(max(-spec["clip"], min(spec["clip"], value))) for value in vector]
