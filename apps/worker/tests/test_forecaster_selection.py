"""Which forecaster a worker uses: AutoETS everywhere, TimesFM 3.0 only on a developer's machine."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from worker.adapters.forecasting import StatsForecastBaseline, TimesFMForecaster
from worker.bootstrap import build_forecaster
from worker.settings import Settings


def test_the_default_is_autoets() -> None:
    forecaster = build_forecaster(Settings(_env_file=None))

    assert isinstance(forecaster, StatsForecastBaseline)
    assert forecaster.name == "statsforecast-auto-ets"


def test_timesfm_is_loaded_up_front_on_a_local_machine(monkeypatch: pytest.MonkeyPatch) -> None:
    loaded: list[str] = []
    monkeypatch.setattr(TimesFMForecaster, "warmup", lambda self: loaded.append(self.name))

    forecaster = build_forecaster(
        Settings(_env_file=None, environment="local", forecaster="timesfm")
    )

    assert isinstance(forecaster, TimesFMForecaster)
    assert loaded == ["timesfm-3.0-mlx"]


@pytest.mark.parametrize("environment", ["dev", "prod", "production", ""])
def test_timesfm_weights_are_non_commercial_so_only_local_may_use_them(environment: str) -> None:
    with pytest.raises(ValueError, match="non-commercial"):
        build_forecaster(Settings(_env_file=None, environment=environment, forecaster="timesfm"))


def test_a_missing_timesfm_install_fails_at_startup_with_the_fix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(self: TimesFMForecaster) -> None:
        raise ModuleNotFoundError("timesfm3")

    monkeypatch.setattr(TimesFMForecaster, "warmup", broken)

    with pytest.raises(RuntimeError, match="uv sync --group local"):
        build_forecaster(Settings(_env_file=None, environment="local", forecaster="timesfm"))


def test_unknown_forecasters_are_rejected_by_the_settings() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, forecaster="prophet")  # ty: ignore[invalid-argument-type]


def test_warmup_loads_the_model_once(monkeypatch: pytest.MonkeyPatch) -> None:
    forecaster = TimesFMForecaster()
    calls: list[int] = []
    monkeypatch.setattr(forecaster, "_load", lambda: calls.append(1) or object())

    forecaster.warmup()

    assert calls == [1]
