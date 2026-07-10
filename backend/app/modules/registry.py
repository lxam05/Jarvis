"""Module registry for future plugin modules."""

REGISTERED_MODULES: list[str] = [
    "garmin",
    "nutrition",
    "coaching",
    "dashboard",
]


def register_module(name: str) -> None:
    if name not in REGISTERED_MODULES:
        REGISTERED_MODULES.append(name)
