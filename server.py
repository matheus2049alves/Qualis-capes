"""
Servidor do Classificador Qualis CAPES.

Serve os arquivos estáticos e expõe um proxy para a API Elsevier,
evitando problemas de CORS e protegendo a API Key.

Uso: python server.py
"""

import os
import json
import http.server
import urllib.request
import urllib.error
from urllib.parse import urlparse

from dotenv import load_dotenv

# Carrega .env da raiz do projeto
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

API_KEY = os.environ.get("ELSEVIER_API_KEY", "")
ELSEVIER_BASE = "https://api.elsevier.com/content/serial/title/issn"
PORT = int(os.environ.get("PORT", 8080))

# Cache em memória para evitar chamadas repetidas na mesma sessão
_session_cache = {}


class QualisHandler(http.server.SimpleHTTPRequestHandler):
    """Handler que serve arquivos estáticos e proxy da API Elsevier."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_ROOT, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        # Rota de proxy: /api/citescore/XXXX-XXXX
        if parsed.path.startswith("/api/citescore/"):
            self.handle_citescore(parsed.path)
            return

        # Arquivos estáticos (comportamento padrão)
        super().do_GET()

    def handle_citescore(self, path):
        """Proxy para a API Elsevier Serial Title."""
        issn = path.replace("/api/citescore/", "").strip("/")

        if not issn or len(issn) < 8:
            self.send_json(400, {"error": "ISSN invalido"})
            return

        if not API_KEY:
            self.send_json(503, {"error": "ELSEVIER_API_KEY nao configurada"})
            return

        # Cache hit
        if issn in _session_cache:
            self.send_json(200, _session_cache[issn])
            return

        # Chamar API Elsevier
        url = f"{ELSEVIER_BASE}/{issn}?view=CITESCORE"
        req = urllib.request.Request(url, headers={
            "X-ELS-APIKey": API_KEY,
            "Accept": "application/json"
        })

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                result = self.parse_elsevier(data)
                _session_cache[issn] = result
                self.send_json(200, result)

        except urllib.error.HTTPError as e:
            if e.code == 404:
                result = {"citeScore": None, "source": "api", "status": "not_found"}
                _session_cache[issn] = result
                self.send_json(200, result)
            else:
                self.send_json(502, {
                    "error": f"Elsevier API error: {e.code}",
                    "citeScore": None
                })

        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {
                "error": "Timeout ao consultar API Elsevier",
                "citeScore": None
            })

    def parse_elsevier(self, data):
        """Extrai CiteScore do response da API Elsevier."""
        result = {"citeScore": None, "source": "api", "status": "ok"}

        entries = data.get("serial-metadata-response", {}).get("entry", [])
        if not entries:
            result["status"] = "empty_response"
            return result

        entry = entries[0]
        cs_info = entry.get("citeScoreYearInfoList", {})
        cs_value = cs_info.get("citeScoreCurrentMetric")

        if cs_value is not None:
            try:
                result["citeScore"] = round(float(cs_value), 1)
            except (ValueError, TypeError):
                pass

        return result

    def send_json(self, status, obj):
        """Envia resposta JSON com headers CORS."""
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        """Filtra logs para não poluir o console com requests de arquivos."""
        path = args[0] if args else ""
        if "/api/" in str(path):
            super().log_message(format, *args)


if __name__ == "__main__":
    if not API_KEY:
        print("[AVISO] ELSEVIER_API_KEY nao encontrada no .env!")
        print("        O proxy de CiteScore nao funcionara.")
        print("        A classificacao continuara usando apenas dados locais.\n")

    print(f"Servidor Qualis CAPES iniciando na porta {PORT}...")
    print(f"Acesse: http://127.0.0.1:{PORT}")
    print(f"Proxy CiteScore: http://127.0.0.1:{PORT}/api/citescore/XXXX-XXXX")
    print(f"Pressione Ctrl+C para parar.\n")

    server = http.server.HTTPServer(("", PORT), QualisHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        server.server_close()
