import pytest

from app.core.config import settings

# Tests manage the model file themselves.
settings.train_on_startup = False


@pytest.fixture
def tmp_model(tmp_path, monkeypatch):
    path = tmp_path / "model.pkl"
    monkeypatch.setattr(settings, "model_path", str(path))
    monkeypatch.setattr(settings, "min_training_rows", 100)
    return path


@pytest.fixture
def headers():
    return {"X-Internal-Key": settings.internal_api_key}
