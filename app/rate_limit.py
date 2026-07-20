import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


_buckets: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _client_key(request: Request, scope: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{scope}:{ip}"


def rate_limit(request: Request, scope: str, max_calls: int, window_seconds: int) -> None:
    now = time.monotonic()
    key = _client_key(request, scope)
    with _lock:
        bucket = _buckets[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= max_calls:
            retry = int(window_seconds - (now - bucket[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Слишком много попыток. Повторите через {max(retry, 1)} сек.",
                headers={"Retry-After": str(max(retry, 1))},
            )
        bucket.append(now)


def login_limiter(request: Request) -> None:
    rate_limit(request, "login", max_calls=5, window_seconds=60)


def forgot_limiter(request: Request) -> None:
    rate_limit(request, "forgot", max_calls=3, window_seconds=60)


def reset_limiter(request: Request) -> None:
    rate_limit(request, "reset", max_calls=5, window_seconds=60)


def register_limiter(request: Request) -> None:
    rate_limit(request, "register", max_calls=3, window_seconds=60)
