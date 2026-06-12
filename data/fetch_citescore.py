"""
Fetch CiteScore via Elsevier Serial Title API.

Consulta a API da Elsevier para cada ISSN do journals.json e salva
o CiteScore em um cache local (citescore_cache.json).

Uso:
    python data/fetch_citescore.py              # Buscar todos (prioriza Enfermagem)
    python data/fetch_citescore.py --limit 100  # Buscar apenas 100
    python data/fetch_citescore.py --stats       # Mostrar estatísticas do cache
    python data/fetch_citescore.py --apply       # Aplicar cache ao journals.json
"""

import os
import sys
import json
import time
import signal
import argparse
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

# ─── Configuração ──────────────────────────────────────────────────

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(DATA_DIR)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

API_KEY = os.environ.get("ELSEVIER_API_KEY", "")
BASE_URL = "https://api.elsevier.com/content/serial/title/issn"
JOURNALS_PATH = os.path.join(DATA_DIR, "journals.json")
CACHE_PATH = os.path.join(DATA_DIR, "citescore_cache.json")

# Rate limiting
REQUEST_DELAY = 0.1  # 100ms entre requests (seguro para não estourar)
SAVE_EVERY = 50      # Salva cache a cada N requests
QUOTA_RESERVE = 100   # Para de buscar quando restar essa quantidade


# ─── Tratamento de interrupção (Ctrl+C) ───────────────────────────

_cache = {}
_dirty = False
_interrupted = False


def save_cache():
    """Salva o cache no disco."""
    global _dirty
    if not _dirty:
        return
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(_cache, f, ensure_ascii=False)
    _dirty = False


def signal_handler(sig, frame):
    """Salva progresso antes de sair."""
    global _interrupted
    _interrupted = True
    print("\n\n[!] Interrupcao detectada! Salvando progresso...")
    save_cache()
    found = sum(1 for v in _cache.values() if v.get("citeScore") is not None)
    print(f"[OK] Cache salvo com {len(_cache)} ISSNs ({found} com CiteScore).")
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)


# ─── Funções de API ───────────────────────────────────────────────

def fetch_citescore(issn, session):
    """
    Consulta a API Elsevier para um ISSN.
    Retorna dict com citeScore, snip, sjr ou None em caso de erro.
    """
    url = f"{BASE_URL}/{issn}"
    headers = {
        "X-ELS-APIKey": API_KEY,
        "Accept": "application/json"
    }
    params = {"view": "CITESCORE"}

    for attempt in range(3):
        try:
            r = session.get(url, headers=headers, params=params, timeout=15)

            # Checar cota restante
            remaining = r.headers.get("X-RateLimit-Remaining")
            if remaining and int(remaining) < QUOTA_RESERVE:
                reset_ts = r.headers.get("X-RateLimit-Reset", "0")
                reset_dt = datetime.fromtimestamp(int(reset_ts))
                print(f"\n[!] Cota quase esgotada ({remaining} restantes).")
                print(f"    Reset em: {reset_dt.strftime('%d/%m/%Y %H:%M')}")
                return None, "QUOTA_LOW"

            if r.status_code == 200:
                return parse_response(r.json()), "OK"
            elif r.status_code == 404:
                return {"citeScore": None, "snip": None, "sjr": None}, "NOT_FOUND"
            elif r.status_code == 429:
                wait = min(2 ** attempt * 5, 60)
                print(f"\n[WAIT] Rate limit (429). Aguardando {wait}s...")
                time.sleep(wait)
                continue
            elif r.status_code >= 500:
                wait = 2 ** attempt * 2
                print(f"\n[!] Erro {r.status_code}. Retry em {wait}s...")
                time.sleep(wait)
                continue
            else:
                return None, f"HTTP_{r.status_code}"

        except requests.exceptions.Timeout:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return None, "TIMEOUT"
        except requests.exceptions.ConnectionError:
            if attempt < 2:
                time.sleep(2 ** attempt * 2)
                continue
            return None, "CONNECTION_ERROR"

    return None, "MAX_RETRIES"


def parse_response(data):
    """Extrai CiteScore, SNIP e SJR do response da API."""
    result = {"citeScore": None, "snip": None, "sjr": None}

    entry_list = data.get("serial-metadata-response", {}).get("entry", [])
    if not entry_list:
        return result

    entry = entry_list[0]

    # CiteScore (métrica completa mais recente)
    cs_info = entry.get("citeScoreYearInfoList", {})
    cs_value = cs_info.get("citeScoreCurrentMetric")
    if cs_value is not None:
        try:
            result["citeScore"] = round(float(cs_value), 1)
        except (ValueError, TypeError):
            pass

    # SNIP
    snip_list = entry.get("SNIPList", {}).get("SNIP", [])
    if snip_list:
        try:
            result["snip"] = round(float(snip_list[0].get("$", "0")), 3)
        except (ValueError, TypeError):
            pass

    # SJR
    sjr_list = entry.get("SJRList", {}).get("SJR", [])
    if sjr_list:
        try:
            result["sjr"] = round(float(sjr_list[0].get("$", "0")), 3)
        except (ValueError, TypeError):
            pass

    return result


# ─── Lógica principal ─────────────────────────────────────────────

def load_cache():
    """Carrega cache existente do disco."""
    global _cache
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            _cache = json.load(f)
        print(f"[CACHE] Carregado: {len(_cache)} ISSNs ja processados.")
    else:
        _cache = {}
        print("[CACHE] Nenhum cache encontrado. Iniciando do zero.")


def get_priority_issns(journals):
    """
    Ordena ISSNs para priorizar:
    1. Enfermagem (área principal do projeto)
    2. Periódicos com JCR (mais relevantes)
    3. Demais periódicos
    """
    enfermagem = []
    with_jcr = []
    others = []

    for issn, data in journals.items():
        if issn in _cache:
            continue  # Já processado

        area = (data.get("area") or "").upper()
        jcr = data.get("jcr")

        if "ENFERMAGEM" in area:
            enfermagem.append(issn)
        elif jcr is not None and jcr > 0:
            with_jcr.append(issn)
        else:
            others.append(issn)

    return enfermagem + with_jcr + others


def show_stats():
    """Mostra estatísticas do cache."""
    load_cache()

    total = len(_cache)
    with_cs = sum(1 for v in _cache.values() if v.get("citeScore") is not None)
    not_found = sum(1 for v in _cache.values() if v.get("citeScore") is None)
    with_snip = sum(1 for v in _cache.values() if v.get("snip") is not None)
    with_sjr = sum(1 for v in _cache.values() if v.get("sjr") is not None)

    # Carregar journals para saber o total
    with open(JOURNALS_PATH, "r", encoding="utf-8") as f:
        journals = json.load(f)

    remaining = len(journals) - total

    print("\n--- Estatisticas do Cache CiteScore ---")
    print("=" * 40)
    print(f"  Total processados:  {total:>7,}")
    print(f"  Com CiteScore:      {with_cs:>7,}")
    print(f"  Sem CiteScore:      {not_found:>7,}")
    print(f"  Com SNIP:           {with_snip:>7,}")
    print(f"  Com SJR:            {with_sjr:>7,}")
    print(f"  Restantes:          {remaining:>7,}")
    print(f"  Total no banco:     {len(journals):>7,}")
    print("=" * 40)


def apply_to_journals():
    """Aplica os CiteScores do cache ao journals.json."""
    load_cache()

    if not _cache:
        print("[ERRO] Cache vazio. Rode o fetch primeiro.")
        return

    with open(JOURNALS_PATH, "r", encoding="utf-8") as f:
        journals = json.load(f)

    applied = 0
    for issn, metrics in _cache.items():
        if issn in journals and metrics.get("citeScore") is not None:
            journals[issn]["citeScore"] = metrics["citeScore"]
            applied += 1

    with open(JOURNALS_PATH, "w", encoding="utf-8") as f:
        json.dump(journals, f, ensure_ascii=False)

    print(f"[OK] CiteScore aplicado a {applied:,} periodicos no journals.json.")
    print(f"     Tamanho do arquivo: {os.path.getsize(JOURNALS_PATH) / 1024 / 1024:.1f} MB")


def run_fetch(limit=None):
    """Executa o fetch de CiteScores via API."""
    global _cache, _dirty

    if not API_KEY:
        print("[ERRO] ELSEVIER_API_KEY nao encontrada!")
        print("       Configure no arquivo .env na raiz do projeto.")
        sys.exit(1)

    # Carregar dados
    load_cache()

    print(f"[INFO] Carregando journals.json...")
    with open(JOURNALS_PATH, "r", encoding="utf-8") as f:
        journals = json.load(f)
    print(f"   {len(journals):,} periódicos no banco.")

    # Priorizar ISSNs
    issns = get_priority_issns(journals)
    total_pending = len(issns)
    print(f"   {total_pending:,} ISSNs pendentes de consulta.")

    if limit:
        issns = issns[:limit]
        print(f"   Limitando a {limit:,} consultas.")

    if not issns:
        print("\n[OK] Todos os ISSNs ja foram processados!")
        return

    # Fazer requests
    session = requests.Session()
    fetched = 0
    found = 0
    errors = 0
    start_time = time.time()

    print(f"\n>>> Iniciando fetch de {len(issns):,} ISSNs...")
    print(f"    Delay entre requests: {REQUEST_DELAY}s")
    print(f"    Salvando cache a cada {SAVE_EVERY} requests")
    print(f"    Pressione Ctrl+C para parar (progresso sera salvo)\n")

    for i, issn in enumerate(issns):
        if _interrupted:
            break

        # Progresso
        elapsed = time.time() - start_time
        rate = fetched / elapsed if elapsed > 0 else 0
        eta_seconds = (len(issns) - i) / rate if rate > 0 else 0
        eta = str(timedelta(seconds=int(eta_seconds)))

        pct = (i + 1) / len(issns) * 100
        print(
            f"\r  [{pct:5.1f}%] {i+1:,}/{len(issns):,} | "
            f"+{found:,} com CS | -{errors:,} erros | "
            f"{rate:.1f} req/s | ETA {eta}   ",
            end="", flush=True
        )

        # Fetch
        result, status = fetch_citescore(issn, session)

        if status == "QUOTA_LOW":
            print("\n\n[!] Parando por seguranca (cota baixa).")
            save_cache()
            break

        if result is not None:
            _cache[issn] = result
            _dirty = True
            fetched += 1
            if result.get("citeScore") is not None:
                found += 1
        else:
            _cache[issn] = {"citeScore": None, "snip": None, "sjr": None,
                            "error": status}
            _dirty = True
            errors += 1
            fetched += 1

        # Salvar cache periodicamente
        if fetched % SAVE_EVERY == 0:
            save_cache()

        # Rate limiting
        time.sleep(REQUEST_DELAY)

    # Salvar final
    save_cache()

    elapsed = time.time() - start_time
    print(f"\n\n{'=' * 50}")
    print(f"[OK] Fetch concluido!")
    print(f"   Consultados:  {fetched:,}")
    print(f"   Com CiteScore: {found:,}")
    print(f"   Erros:        {errors:,}")
    print(f"   Tempo:        {timedelta(seconds=int(elapsed))}")
    print(f"   Cache total:  {len(_cache):,} ISSNs")
    print(f"{'=' * 50}")
    print(f"\nPróximo passo: python data/fetch_citescore.py --apply")


# ─── CLI ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch CiteScore via Elsevier API"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Limitar número de consultas"
    )
    parser.add_argument(
        "--stats", action="store_true",
        help="Mostrar estatísticas do cache"
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Aplicar CiteScores do cache ao journals.json"
    )

    args = parser.parse_args()

    if args.stats:
        show_stats()
    elif args.apply:
        apply_to_journals()
    else:
        run_fetch(limit=args.limit)


if __name__ == "__main__":
    main()
