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
from datetime import datetime

from dotenv import load_dotenv

# Carrega .env da raiz do projeto
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

API_KEY = os.environ.get("ELSEVIER_API_KEY", "")
ELSEVIER_BASE = "https://api.elsevier.com/content/serial/title/issn"
PORT = int(os.environ.get("PORT", 8080))

# Cache em memória para evitar chamadas repetidas na mesma sessão (CiteScore/Elsevier)
_session_cache = {}

# Caches em disco persistentes para indexadores (validade de 30 dias)
SCIELO_CACHE_PATH = os.path.join(PROJECT_ROOT, "data", "scielo_cache.json")
LILACS_CACHE_PATH = os.path.join(PROJECT_ROOT, "data", "lilacs_cache.json")
LATINDEX_CACHE_PATH = os.path.join(PROJECT_ROOT, "data", "latindex_cache.json")

def load_json_cache(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AVISO] Erro ao carregar cache do arquivo {path}: {e}")
    return {}

_scielo_cache = load_json_cache(SCIELO_CACHE_PATH)
_lilacs_cache = load_json_cache(LILACS_CACHE_PATH)
_latindex_cache = load_json_cache(LATINDEX_CACHE_PATH)

def save_json_cache(path, data):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[ERRO] Falha ao salvar cache no arquivo {path}: {e}")

def check_cache_validity(cache_dict, key):
    """Retorna o registro se estiver no cache e tiver menos de 30 dias. Caso contrario, None."""
    entry = cache_dict.get(key)
    if not entry:
        return None
    
    updated_at_str = entry.get("updated_at")
    if not updated_at_str:
        return None
        
    try:
        updated_at = datetime.strptime(updated_at_str, "%Y-%m-%d")
        delta = datetime.now() - updated_at
        if delta.days < 30:
            return entry
    except ValueError:
        pass
    return None


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

        # Rota de proxy: /api/scielo/XXXX-XXXX
        if parsed.path.startswith("/api/scielo/"):
            self.handle_scielo(parsed.path)
            return

        # Rota de proxy: /api/lilacs/XXXX-XXXX
        if parsed.path.startswith("/api/lilacs/"):
            self.handle_lilacs(parsed.path)
            return

        # Rota de proxy: /api/latindex/XXXX-XXXX
        if parsed.path.startswith("/api/latindex/"):
            self.handle_latindex(parsed.path)
            return

        # Arquivos estáticos (comportamento padrão)
        super().do_GET()

    def handle_scielo(self, path):
        """Proxy para a API SciELO ArticleMeta com cache persistente de 30 dias."""
        issn = path.replace("/api/scielo/", "").strip("/")

        if not issn or len(issn) < 8:
            self.send_json(400, {"error": "ISSN invalido"})
            return

        # Verifica cache em disco
        cached = check_cache_validity(_scielo_cache, issn)
        if cached:
            self.send_json(200, cached)
            return

        # Chamar API SciELO ArticleMeta
        url = f"https://articlemeta.scielo.org/api/v1/journal/?issn={issn}"
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.5"
        })

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                
                scielo = len(data) > 0
                revenf = any(item.get("collection") == "rve" for item in data) if isinstance(data, list) else False
                
                title = None
                if scielo and isinstance(data, list):
                    v100 = data[0].get("v100")
                    if v100 and isinstance(v100, list) and len(v100) > 0:
                        title = v100[0].get("_")
                
                today_str = datetime.now().strftime("%Y-%m-%d")
                result = {
                    "scielo": scielo, 
                    "revenf": revenf, 
                    "title": title, 
                    "updated_at": today_str,
                    "status": "ok"
                }
                
                # Salva no cache persistente
                _scielo_cache[issn] = result
                save_json_cache(SCIELO_CACHE_PATH, _scielo_cache)
                
                self.send_json(200, result)

        except urllib.error.HTTPError as e:
            self.send_json(502, {
                "error": f"SciELO API error: {e.code}",
                "scielo": False,
                "revenf": False,
                "updated_at": None
            })

        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {
                "error": "Timeout ao consultar API SciELO",
                "scielo": False,
                "revenf": False,
                "updated_at": None
            })

    def handle_lilacs(self, path):
        """Proxy para a API LILACS com cache persistente de 30 dias, extraindo também o status do BDENF."""
        issn = path.replace("/api/lilacs/", "").strip("/")

        if not issn or len(issn) < 8:
            self.send_json(400, {"error": "ISSN invalido"})
            return

        # Verifica cache em disco (exige que o cache antigo contenha 'bdenf' para ser aproveitado)
        cached = check_cache_validity(_lilacs_cache, issn)
        if cached and "bdenf" in cached:
            self.send_json(200, cached)
            return

        # Chamar API LILACS
        url = f"https://lilacs.bvsalud.org/wp-json/test/v1/bvs/journals/search?q={issn}"
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.5"
        })

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_data = json.loads(resp.read().decode("utf-8"))
                
                response_data = raw_data.get("data", {}).get("diaServerResponse", [{}])[0].get("response", {})
                num_found = response_data.get("numFound", 0)
                docs = response_data.get("docs", [])
                
                lilacs = num_found >= 1
                bdenf = False
                title = None
                issn_real = None
                if lilacs and len(docs) > 0:
                    title = docs[0].get("title")
                    indexed_dbs = docs[0].get("indexed_database", [])
                    bdenf = any("BDENF" in db.upper() for db in indexed_dbs)
                    issn_list = docs[0].get("issn", [])
                    if len(issn_list) > 0:
                        issn_real = issn_list[0]
                
                today_str = datetime.now().strftime("%Y-%m-%d")
                result = {
                    "lilacs": lilacs,
                    "bdenf": bdenf,
                    "title": title,
                    "issn": issn_real,
                    "updated_at": today_str,
                    "status": "ok"
                }
                
                # Salva no cache persistente
                _lilacs_cache[issn] = result
                save_json_cache(LILACS_CACHE_PATH, _lilacs_cache)
                
                self.send_json(200, result)

        except urllib.error.HTTPError as e:
            self.send_json(502, {
                "error": f"LILACS API error: {e.code}",
                "lilacs": False,
                "bdenf": False,
                "issn": None,
                "updated_at": None
            })

        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {
                "error": "Timeout ao consultar API LILACS",
                "lilacs": False,
                "bdenf": False,
                "issn": None,
                "updated_at": None
            })

    def handle_latindex(self, path):
        """Proxy para o portal Latindex com cache persistente de 30 dias."""
        issn = path.replace("/api/latindex/", "").strip("/")

        if not issn or len(issn) < 8:
            self.send_json(400, {"error": "ISSN invalido"})
            return

        # Verifica cache em disco
        cached = check_cache_validity(_latindex_cache, issn)
        if cached:
            self.send_json(200, cached)
            return

        # Chamar portal Latindex (búsqueda avanzada)
        # Se usar idMod=0 (Directorio), buscamos em todas as revistas registradas
        url = f"https://www.latindex.org/latindex/bAvanzada/resultado?idMod=0&send=Buscar&issn={issn}"
        req = urllib.request.Request(url, headers={
            "Accept": "text/html,application/xhtml+xml,application/xml",
            "User-Agent": "Mozilla/5.5"
        })

        try:
            import re
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                
                # Checa se foi encontrado pelo termo "Resultado:&nbsp;0&nbsp;Revistas"
                has_zero_results = "Resultado:&nbsp;0&nbsp;Revistas" in html
                has_results = "Resultado:&nbsp;" in html and not has_zero_results
                
                latindex = has_results
                title = None
                if latindex:
                    # Extrai o título se possível usando regex
                    # href="https://www.latindex.org/latindex/ficha/\d+">TITLE</a>
                    match = re.search(r'href="https://www\.latindex\.org/latindex/ficha/\d+"[^>]*>\s*([^<]+?)\s*</a>', html)
                    if match:
                        title = match.group(1).strip()

                today_str = datetime.now().strftime("%Y-%m-%d")
                result = {
                    "latindex": latindex,
                    "title": title,
                    "updated_at": today_str,
                    "status": "ok"
                }

                # Salva no cache persistente
                _latindex_cache[issn] = result
                save_json_cache(LATINDEX_CACHE_PATH, _latindex_cache)

                self.send_json(200, result)

        except urllib.error.HTTPError as e:
            self.send_json(502, {
                "error": f"Latindex portal error: {e.code}",
                "latindex": False,
                "updated_at": None
            })

        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {
                "error": "Timeout ao consultar portal Latindex",
                "latindex": False,
                "updated_at": None
            })

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
