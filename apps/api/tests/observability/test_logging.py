"""The API maps its settings onto the shared logging configuration."""

import io
import json

import structlog

from api.observability.logging import configure_logging
from api.settings import Settings


def test_settings_become_the_standard_fields() -> None:
    stream = io.StringIO()
    configure_logging(
        Settings(environment="prod", service_version="1.2.3", log_json=True), stream=stream
    )
    structlog.contextvars.clear_contextvars()

    structlog.get_logger().info("job.finished")

    [entry] = [json.loads(line) for line in stream.getvalue().splitlines() if line]
    assert (entry["service"], entry["env"], entry["version"]) == ("api", "prod", "1.2.3")


def test_log_level_setting_overrides_the_environment_default() -> None:
    stream = io.StringIO()
    configure_logging(Settings(environment="prod", log_json=True, log_level="error"), stream=stream)

    structlog.get_logger().warning("quiet")
    structlog.get_logger().error("loud")

    events = [json.loads(line)["event"] for line in stream.getvalue().splitlines() if line]
    assert events == ["loud"]
