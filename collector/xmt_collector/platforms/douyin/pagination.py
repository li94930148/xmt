from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ScrollProgress:
    stable_cycles: int = 0
    iterations: int = 0


def advance_scroll(state: ScrollProgress, *, at_bottom: bool, progressed: bool, stable_limit: int = 3) -> tuple[ScrollProgress, bool]:
    """Advance full-snapshot scroll evidence; a fixed iteration count is never success."""
    state.iterations += 1
    state.stable_cycles = 0 if progressed or not at_bottom else state.stable_cycles + 1
    return state, at_bottom and state.stable_cycles >= stable_limit
