import os
import re
import json
import pandas as pd

# Caminhos dos arquivos
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
CLASSIFICACAO_PATH = os.path.join(DATA_DIR, "classificacao.xlsx")
JCR_PATH = os.path.join(DATA_DIR, "JCR_nursing.csv")
SCOPUS_PATH = os.path.join(DATA_DIR, "journals_scopus.xlsx")
OUTPUT_PATH = os.path.join(DATA_DIR, "journals.json")

def normalize_issn(issn):
    """
    Normaliza o ISSN para o formato XXXX-XXXX.
    """
    if pd.isna(issn):
        return None
    val = str(issn).strip().upper()
    # Remove qualquer caractere que não seja número ou X
    val = re.sub(r'[^0-9X]', '', val)
    if len(val) == 8:
        return f"{val[:4]}-{val[4:]}"
    return None

def parse_float(val):
    """
    Converte um valor para float de forma segura.
    """
    if pd.isna(val):
        return None
    try:
        # Se for string, substitui vírgula por ponto
        s = str(val).strip().replace(',', '.')
        if s.upper() in ['N/A', 'N/A ', '', 'NONE', 'NULL']:
            return None
        return float(s)
    except ValueError:
        return None

def compile_database():
    print("Iniciando compilação do banco de dados de periódicos...")
    
    # Dicionário final: { normalized_issn: { title, area, jcr, citeScore, indexers, metrics } }
    journals = {}
    
    # --- 1. PROCESSAR CLASSIFICACAO.XLSX (SUCUPIRA) ---
    if os.path.exists(CLASSIFICACAO_PATH):
        print(f"Lendo {CLASSIFICACAO_PATH}...")
        try:
            # Carrega a tabela do Qualis Sucupira
            df_class = pd.read_excel(CLASSIFICACAO_PATH)
            print(f"Processando {len(df_class)} registros do Sucupira...")
            
            for idx, row in df_class.iterrows():
                raw_issn = row.get('ISSN')
                issn = normalize_issn(raw_issn)
                if not issn:
                    continue
                
                title = str(row.get('Título', '')).strip()
                area_aval = str(row.get('Área de Avaliação', '')).strip().upper()
                
                # Verifica se é da área de Enfermagem
                is_nursing = "ENFERMAGEM" in area_aval
                
                if issn not in journals:
                    journals[issn] = {
                        "title": title,
                        "area": "Enfermagem" if is_nursing else "Outras Áreas",
                        "jcr": None,
                        "citeScore": None,
                        "indexers": [],
                        "metrics": {
                            "cuiden": None
                        }
                    }
                else:
                    # Se já existe, atualiza a área para Enfermagem caso encontre em alguma linha
                    if is_nursing:
                        journals[issn]["area"] = "Enfermagem"
                    # Se o título atual estiver vazio ou for genérico, atualiza
                    if title and (not journals[issn]["title"] or len(title) > len(journals[issn]["title"])):
                        journals[issn]["title"] = title
            
            print(f"Sucupira processado: {len(journals)} periódicos identificados.")
        except Exception as e:
            print(f"Erro ao processar classificacao.xlsx: {e}")
    else:
        print(f"AVISO: {CLASSIFICACAO_PATH} não encontrado. Ignorando mapeamento de áreas.")

    # --- 2. PROCESSAR JCR_NURSING.CSV ---
    if os.path.exists(JCR_PATH):
        print(f"Lendo {JCR_PATH}...")
        try:
            # Pula as duas primeiras linhas de metadados
            df_jcr = pd.read_csv(JCR_PATH, skiprows=2)
            print(f"Processando {len(df_jcr)} registros de JCR (Enfermagem)...")
            
            # ATENÇÃO: O CSV do JCR Clarivate tem um trailing comma em cada linha
            # de dados e o campo "Journal name" vem entre aspas (contém vírgulas).
            # Isso causa deslocamento das colunas. Os dados reais ficam assim:
            #   col[0] "Journal name" -> JCR Abbreviation (abreviação)
            #   col[1] "JCR Abbreviation" -> Publisher
            #   col[2] "Publisher" -> ISSN (o ISSN real!)
            #   col[3] "ISSN" -> eISSN (o eISSN real!)
            #   col[4] "eISSN" -> Category ("NURSING")
            #   col[5] "Category" -> Edition ("SCIE, SSCI")
            #   col[6] "Edition" -> 2024 JIF (o JIF real!)
            #   col[7] "2024 JIF" -> JIF Rank
            #   col[8] "JIF Rank" -> NaN (do trailing comma)
            cols = df_jcr.columns.tolist()
            
            for idx, row in df_jcr.iterrows():
                # Acessa pelo índice real das colunas deslocadas
                raw_issn = row.iloc[2] if len(cols) > 2 else None   # Publisher -> ISSN real
                raw_eissn = row.iloc[3] if len(cols) > 3 else None  # ISSN -> eISSN real
                jcr_val = parse_float(row.iloc[6]) if len(cols) > 6 else None  # Edition -> JIF real
                title = str(row.iloc[0] if len(cols) > 0 else '').strip()  # Journal name (abreviação JCR)
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                # Associa a métrica ao ISSN principal ou eISSN
                for target_issn in [issn, eissn]:
                    if not target_issn:
                        continue
                    
                    if target_issn not in journals:
                        journals[target_issn] = {
                            "title": title,
                            "area": "Enfermagem", # Como está na planilha JCR_nursing, é Enfermagem
                            "jcr": jcr_val,
                            "citeScore": None,
                            "indexers": [],
                            "metrics": {
                                "cuiden": None
                            }
                        }
                    else:
                        if jcr_val is not None:
                            journals[target_issn]["jcr"] = jcr_val
                        journals[target_issn]["area"] = "Enfermagem"
                        if title and not journals[target_issn]["title"]:
                            journals[target_issn]["title"] = title
            
            print("JCR Enfermagem processado com sucesso.")
        except Exception as e:
            print(f"Erro ao processar JCR_nursing.csv: {e}")
    else:
        print(f"AVISO: {JCR_PATH} não encontrado. Métricas de JCR não serão carregadas.")

    # --- 3. PROCESSAR JOURNALS_SCOPUS.XLSX ---
    if os.path.exists(SCOPUS_PATH):
        print(f"Lendo {SCOPUS_PATH} (Scopus Sources)...")
        try:
            df_scopus = pd.read_excel(SCOPUS_PATH, sheet_name='Scopus Sources May 2026')
            print(f"Processando {len(df_scopus)} registros da Scopus...")
            
            # A coluna Nursing (2900) está no índice 44 da planilha
            scopus_cols = df_scopus.columns.tolist()
            nursing_col = scopus_cols[44] if len(scopus_cols) > 44 else None
            
            for idx, row in df_scopus.iterrows():
                raw_issn = row.get('ISSN')
                raw_eissn = row.get('EISSN')
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                # O valor real na planilha é "Medline", não "YES"/"Y"
                medline_sourced = str(row.get('Medline-sourced Title? (See additional details under separate tab.)', '')).strip().upper()
                is_medline = medline_sourced in ['YES', 'Y', 'MEDLINE']
                
                # Verifica se está na área de Nursing (coluna 2900)
                is_nursing_scopus = False
                if nursing_col is not None and pd.notna(row.get(nursing_col)):
                    is_nursing_scopus = True
                
                title = str(row.get('Source Title', '')).strip()
                
                for target_issn in [issn, eissn]:
                    if not target_issn:
                        continue
                    
                    if target_issn not in journals:
                        journals[target_issn] = {
                            "title": title,
                            "area": "Enfermagem" if is_nursing_scopus else "Outras Áreas",
                            "jcr": None,
                            "citeScore": None,
                            "indexers": ["MEDLINE"] if is_medline else [],
                            "metrics": {
                                "cuiden": None
                            }
                        }
                    else:
                        if is_medline and "MEDLINE" not in journals[target_issn]["indexers"]:
                            journals[target_issn]["indexers"].append("MEDLINE")
                        # Complementa a área: se Scopus diz Nursing e Sucupira não marcou
                        if is_nursing_scopus and journals[target_issn]["area"] != "Enfermagem":
                            journals[target_issn]["area"] = "Enfermagem"
                        if title and not journals[target_issn]["title"]:
                            journals[target_issn]["title"] = title
            
            print("Scopus/Medline processado com sucesso.")
        except Exception as e:
            print(f"Erro ao processar journals_scopus.xlsx: {e}")
    else:
        print(f"AVISO: {SCOPUS_PATH} não encontrado. Indexadores Medline não serão atualizados.")

    # --- 3.1. PROCESSAR CITESCORE (PLANILHA SEPARADA, SE DISPONÍVEL) ---
    CITESCORE_PATH = os.path.join(DATA_DIR, "citescore.xlsx")
    if os.path.exists(CITESCORE_PATH):
        print(f"Lendo {CITESCORE_PATH} (CiteScore Metrics)...")
        try:
            df_cs = pd.read_excel(CITESCORE_PATH)
            print(f"Processando {len(df_cs)} registros de CiteScore...")
            
            for idx, row in df_cs.iterrows():
                raw_issn = row.get('ISSN') or row.get('Print ISSN')
                raw_eissn = row.get('EISSN') or row.get('E-ISSN')
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                # Tenta encontrar a coluna de CiteScore (varia entre edições)
                cs_val = None
                for cs_col_name in ['CiteScore', 'CiteScore 2024', 'CiteScore 2023', 'Highest CiteScore']:
                    if cs_col_name in df_cs.columns:
                        cs_val = parse_float(row.get(cs_col_name))
                        if cs_val is not None:
                            break
                
                title = str(row.get('Title', row.get('Source Title', ''))).strip()
                
                for target_issn in [issn, eissn]:
                    if not target_issn:
                        continue
                    
                    if target_issn not in journals:
                        journals[target_issn] = {
                            "title": title,
                            "area": "Outras Áreas",
                            "jcr": None,
                            "citeScore": cs_val,
                            "indexers": [],
                            "metrics": {
                                "cuiden": None
                            }
                        }
                    else:
                        if cs_val is not None and journals[target_issn]["citeScore"] is None:
                            journals[target_issn]["citeScore"] = cs_val
                        if title and not journals[target_issn]["title"]:
                            journals[target_issn]["title"] = title
            
            print("CiteScore processado com sucesso.")
        except Exception as e:
            print(f"Erro ao processar citescore.xlsx: {e}")
    else:
        print(f"AVISO: {CITESCORE_PATH} não encontrado. CiteScore não será carregado.")

    # --- 3.2. PROCESSAR CITESCORE_CACHE.JSON (GERADO PELA API ELSEVIER) ---
    CITESCORE_CACHE_PATH = os.path.join(DATA_DIR, "citescore_cache.json")
    if os.path.exists(CITESCORE_CACHE_PATH):
        print(f"Lendo {CITESCORE_CACHE_PATH} (Cache API Elsevier)...")
        try:
            with open(CITESCORE_CACHE_PATH, "r", encoding="utf-8") as f:
                cs_cache = json.load(f)
            
            applied = 0
            for issn, metrics in cs_cache.items():
                cs_val = metrics.get("citeScore")
                if cs_val is not None and issn in journals:
                    journals[issn]["citeScore"] = cs_val
                    applied += 1
            
            print(f"CiteScore (API Elsevier): {applied} periódicos atualizados de {len(cs_cache)} no cache.")
        except Exception as e:
            print(f"Erro ao processar citescore_cache.json: {e}")
    else:
        print(f"INFO: {CITESCORE_CACHE_PATH} não encontrado. Rode fetch_citescore.py para popular.")

    # --- 4. GRAVAR RESULTADO EM JOURNALS.JSON ---
    print(f"Gravando base consolidada contendo {len(journals)} periódicos...")
    try:
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(journals, f, indent=2, ensure_ascii=False)
        print(f"Banco de dados compilado com sucesso e salvo em: {OUTPUT_PATH}")
    except Exception as e:
        print(f"Erro ao gravar arquivo journals.json: {e}")

if __name__ == "__main__":
    compile_database()
