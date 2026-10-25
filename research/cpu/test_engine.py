import unittest

from engine import Engine


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine()
        self.addCleanup(self.engine.close)

    def test_definitions_and_rules_are_enumerable_without_creating_a_match(self):
        rules = self.engine.describe("rules")
        self.assertEqual(rules["limits"]["maxPp"], 12)
        card = self.engine.describe(card_id="y_9")
        self.assertEqual(card["name"], "ぷらむ")
        self.assertIn("2ダメージ", card["effect"])
        self.assertGreater(len(self.engine.describe("commands")), 10)

    def test_choose_roll_and_continue_with_the_other_actor(self):
        snapshot = self.engine.new(seed=11)
        decision = snapshot["decision"]
        next_state = self.engine.act(decision, decision["observation"]["actions"][0]["id"])
        self.assertEqual(next_state["decision"]["revision"], 1)
        with self.assertRaisesRegex(ValueError, "Stale"):
            self.engine.act(decision, decision["observation"]["actions"][0]["id"])
        actor = next_state["actors"][0]
        opponent = self.engine.observe(actor)["decision"]
        self.assertEqual(opponent["viewer"], actor)
        self.engine.act(opponent, opponent["observation"]["actions"][0]["id"])

    def test_cpu_can_advance_setup_and_errors_do_not_reset_game(self):
        self.engine.new(seed=19)
        for _ in range(30):
            self.engine.cpu()
        snapshot = self.engine.observe()
        self.assertEqual(snapshot["decision"]["observation"]["phase"], "playing")
        with self.assertRaises(ValueError):
            self.engine.request("unknown")
        self.assertEqual(self.engine.observe()["decision"]["revision"], snapshot["decision"]["revision"])
        self.assertIsInstance(self.engine.inspect()["unavailable"], list)


if __name__ == "__main__":
    unittest.main()
