"""NFR-7: request ids. Node sends X-Request-Id; we log it on every line and send it back
when calling Node, so one id traces a request across both services."""

import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

request_id: ContextVar[str] = ContextVar("request_id", default="-")
VALID = re.compile(r"^[\w.-]{1,100}$")
access_log = logging.getLogger("access")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        given = request.headers.get("x-request-id", "")
        rid = given if VALID.match(given) else uuid.uuid4().hex
        token = request_id.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = rid
            if request.url.path != "/health":  # keep health-check noise out of the log
                access_log.info("%s %s %s %.0f ms", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
            return response
        finally:
            request_id.reset(token)


def setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
