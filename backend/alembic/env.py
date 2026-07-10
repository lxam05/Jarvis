from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.core.db import Base

# Import all models so Alembic detects them
from app.modules.coaching.models import CoachingInsight  # noqa: F401
from app.modules.core.models import User, UserSettings  # noqa: F401
from app.modules.garmin.models import (  # noqa: F401
    GarminActivity,
    GarminDailySummary,
    GarminHrv,
    GarminSleep,
    GarminSyncCursor,
    GarminSyncRun,
    GarminWeight,
)
from app.modules.nutrition.models import (  # noqa: F401
    BodyWeightEntry,
    Meal,
    MealItem,
    MealTemplate,
    NutritionConversation,
    NutritionMessage,
)

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("+asyncpg", ""))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
