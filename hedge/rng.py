"""The dice machine: mulberry32, in six lines of arithmetic.

The same numbers come out in Python, C++ and JavaScript, so a seed names the
same hedge everywhere. See the classroom's RNG.md in games-osr-fort-on-lake.
"""

MASK = 0xFFFFFFFF


class Mulberry32:
    def __init__(self, seed=0):
        self.state = seed & MASK

    def next_u32(self):
        self.state = (self.state + 0x6D2B79F5) & MASK
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & MASK
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)) & MASK)) & MASK
        return (t ^ (t >> 14)) & MASK

    def roll(self, sides):
        """1 to sides, one call per die."""
        return 1 + self.next_u32() % sides

    def randint(self, low, high):
        """low to high, inclusive. One call."""
        return low + self.next_u32() % (high - low + 1)


def seed_from_text(text):
    """The classroom rule: keep the digits, ignore the rest, 32 bits."""
    state = 0
    for ch in text:
        if "0" <= ch <= "9":
            state = (state * 10 + ord(ch) - 48) & MASK
    return state
