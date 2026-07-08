#!/usr/bin/env python3
"""Локальный dev-сервер БЕЗ кэширования.

Зачем: обычный `python3 -m http.server` и service worker кэшируют файлы, из-за чего
правки «залипают» — браузер отдаёт старые версии даже после перезагрузки. Этот сервер
шлёт `Cache-Control: no-store`, поэтому каждый reload гарантированно берёт свежий код.

Запуск:
    python3 serve.py            # порт 8145
    python3 serve.py 9000       # другой порт

Открыть адрес, который выведется в консоли. Для чистого старта (без старого service
worker) удобно менять порт — новый порт = новый origin без кэша и SW.
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8145


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Тише в консоли: без подробного лога каждого запроса.
    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), NoCacheHandler)
    print(f"Дневник бассейна: http://localhost:{PORT}  (Ctrl+C — остановить)")
    print("Кэширование отключено — правки видны сразу после reload.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")
