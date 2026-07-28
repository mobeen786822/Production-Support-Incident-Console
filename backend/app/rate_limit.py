from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException


class LoginRateLimiter:
    def __init__(self, attempts: int, window_seconds: int) -> None:
        self.attempts = attempts
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            failures = self._failures.get(key)
            if failures is None:
                return
            self._discard_expired(failures, now)
            if not failures:
                del self._failures[key]
                return
            if len(failures) < self.attempts:
                return

            retry_after = max(1, int(self.window_seconds - (now - failures[0])) + 1)
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    def record_failure(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            failures = self._failures[key]
            self._discard_expired(failures, now)
            failures.append(now)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()

    def _discard_expired(self, failures: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while failures and failures[0] <= cutoff:
            failures.popleft()
