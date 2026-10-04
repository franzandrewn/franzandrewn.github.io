from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse


class ModuleHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "application/javascript",
    }


parser = argparse.ArgumentParser(description="Serve the prototype with JavaScript module MIME types.")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8080)
args = parser.parse_args()

server = ThreadingHTTPServer((args.host, args.port), ModuleHandler)
print(f"Serving prototype at http://{args.host}:{args.port}")
server.serve_forever()
