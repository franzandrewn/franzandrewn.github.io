from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse


class ModuleHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "application/javascript",
    }

    def translate_path(self, path):
        clean_path = path.split("?", 1)[0]
        for locale in ("ru", "en"):
            prefix = f"/{locale}"
            if clean_path == prefix or clean_path.startswith(f"{prefix}/"):
                clean_path = clean_path[len(prefix):] or "/"
                break
        return super().translate_path(clean_path)


parser = argparse.ArgumentParser(description="Serve the prototype with JavaScript module MIME types.")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8080)
args = parser.parse_args()

server = ThreadingHTTPServer((args.host, args.port), ModuleHandler)
print(f"Serving prototype at http://{args.host}:{args.port}")
server.serve_forever()
