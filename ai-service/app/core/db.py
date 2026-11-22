from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from .config import settings


@lru_cache(maxsize=1)
def get_db() -> Database:
    client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    return client.get_default_database(default="shiptrack")
