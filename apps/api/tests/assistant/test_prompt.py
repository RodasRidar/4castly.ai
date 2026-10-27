"""The frozen system prompt keeps the rules the number guard relies on (found live)."""

from __future__ import annotations

from api.assistant.prompt import SYSTEM_PROMPT


def test_figures_already_carry_their_unit() -> None:
    # Live run: the model wrote "[[f1_3]] semanas" and the user saw "0 sem semanas".
    assert "already includes its unit" in SYSTEM_PROMPT


def test_every_turn_calls_the_tools_again_instead_of_reusing_earlier_ids() -> None:
    # Live run: on a follow-up the model reused an id from an earlier turn, so it never resolved.
    assert "same turn" in SYSTEM_PROMPT
    assert "earlier turns" in SYSTEM_PROMPT


def test_the_prompt_never_contains_a_value_a_customer_could_have_supplied() -> None:
    assert "{" not in SYSTEM_PROMPT


def test_a_run_without_stock_must_not_be_talked_about_in_terms_of_risk() -> None:
    assert "stock_known" in SYSTEM_PROMPT
    assert "no stock" in SYSTEM_PROMPT
