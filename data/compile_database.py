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
    
    # Conjuntos temporários em memória para identificar periódicos de Enfermagem e Medline
    jcr_nursing_issns = set()
    scopus_nursing_issns = set()
    medline_issns = set()
    
    jcr_values = {}
    
    # --- 1. PROCESSAR JCR_NURSING.CSV PRIMEIRO ---
    if os.path.exists(JCR_PATH):
        print(f"Lendo {JCR_PATH}...")
        try:
            df_jcr = pd.read_csv(JCR_PATH, skiprows=2)
            cols = df_jcr.columns.tolist()
            for idx, row in df_jcr.iterrows():
                raw_issn = row.iloc[2] if len(cols) > 2 else None
                raw_eissn = row.iloc[3] if len(cols) > 3 else None
                jcr_val = parse_float(row.iloc[6]) if len(cols) > 6 else None
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                for target_issn in [issn, eissn]:
                    if target_issn:
                        jcr_nursing_issns.add(target_issn)
                        if jcr_val is not None:
                            jcr_values[target_issn] = jcr_val
            print(f"JCR Enfermagem em memória: {len(jcr_nursing_issns)} ISSNs.")
        except Exception as e:
            print(f"Erro ao processar JCR: {e}")

    # --- 2. PROCESSAR JOURNALS_SCOPUS.XLSX SEGUNDO ---
    if os.path.exists(SCOPUS_PATH):
        print(f"Lendo {SCOPUS_PATH} (Scopus Sources)...")
        try:
            df_scopus = pd.read_excel(SCOPUS_PATH, sheet_name='Scopus Sources May 2026')
            scopus_cols = df_scopus.columns.tolist()
            nursing_col = scopus_cols[44] if len(scopus_cols) > 44 else None
            
            for idx, row in df_scopus.iterrows():
                raw_issn = row.get('ISSN')
                raw_eissn = row.get('EISSN')
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                medline_sourced = str(row.get('Medline-sourced Title? (See additional details under separate tab.)', '')).strip().upper()
                is_medline = medline_sourced in ['YES', 'Y', 'MEDLINE']
                
                is_nursing_scopus = False
                if nursing_col is not None and pd.notna(row.get(nursing_col)):
                    is_nursing_scopus = True
                
                for target_issn in [issn, eissn]:
                    if target_issn:
                        if is_nursing_scopus:
                            scopus_nursing_issns.add(target_issn)
                        if is_medline:
                            medline_issns.add(target_issn)
            print(f"Scopus Nursing em memória: {len(scopus_nursing_issns)} ISSNs.")
            print(f"Medline indexados em memória: {len(medline_issns)} ISSNs.")
        except Exception as e:
            print(f"Erro ao processar Scopus: {e}")

    # Dicionário final: { normalized_issn: { title, area, jcr, citeScore, indexers, metrics } }
    journals = {}
    
    # --- 3. PROCESSAR CLASSIFICACAO.XLSX (SUCUPIRA) TERCEIRO ---
    if os.path.exists(CLASSIFICACAO_PATH):
        print(f"Lendo {CLASSIFICACAO_PATH}...")
        try:
            df_class = pd.read_excel(CLASSIFICACAO_PATH)
            print(f"Processando {len(df_class)} registros do Sucupira...")
            
            for idx, row in df_class.iterrows():
                raw_issn = row.get('ISSN')
                issn = normalize_issn(raw_issn)
                if not issn:
                    continue
                
                title = str(row.get('Título', '')).strip()
                area_aval = str(row.get('Área de Avaliação', '')).strip().upper()
                
                # Regra inteligente de Área Mãe (Enfermagem)
                # O periódico pertence à área de Enfermagem apenas se:
                # - For avaliado em Enfermagem em classificacao.xlsx E:
                #   - Estiver no JCR de Enfermagem OU
                #   - Estiver no Scopus na categoria Nursing OU
                #   - Tiver palavra-chave de Enfermagem no título
                is_nursing_candidate = "ENFERMAGEM" in area_aval
                is_real_nursing = False
                if is_nursing_candidate:
                    is_real_nursing = (
                        issn in jcr_nursing_issns or
                        issn in scopus_nursing_issns or
                        any(k in title.upper() for k in ["ENFERM", "NURSIN", "CUIDADO", "ENFERMER"])
                    )
                
                if issn not in journals:
                    journals[issn] = {
                        "title": title,
                        "area": "Enfermagem" if is_real_nursing else "Outras Áreas",
                        "jcr": jcr_values.get(issn),
                        "citeScore": None,
                        "indexers": ["MEDLINE"] if issn in medline_issns else [],
                        "metrics": {
                            "cuiden": None
                        }
                    }
                else:
                    # Se já existe, promove para Enfermagem se qualificando pelas regras
                    if is_real_nursing:
                        journals[issn]["area"] = "Enfermagem"
                    # Se o título atual estiver vazio ou for genérico, atualiza
                    if title and (not journals[issn]["title"] or len(title) > len(journals[issn]["title"])):
                        journals[issn]["title"] = title
                    # Atualiza indexador Medline
                    if issn in medline_issns and "MEDLINE" not in journals[issn]["indexers"]:
                        journals[issn]["indexers"].append("MEDLINE")
                    # Atualiza JCR se disponível
                    if jcr_values.get(issn) is not None:
                        journals[issn]["jcr"] = jcr_values.get(issn)
            
            print(f"Sucupira processado: {len(journals)} periódicos identificados.")
        except Exception as e:
            print(f"Erro ao processar classificacao.xlsx: {e}")
    else:
        print(f"AVISO: {CLASSIFICACAO_PATH} não encontrado. Ignorando mapeamento de áreas.")

    # --- 4. COMPLEMENTAR COM JCR E SCOPUS QUE PODEM NÃO ESTAR NO SUCUPIRA ---
    for issn in jcr_nursing_issns:
        if issn not in journals:
            journals[issn] = {
                "title": "Periódico do JCR (Enfermagem)",
                "area": "Enfermagem",
                "jcr": jcr_values.get(issn),
                "citeScore": None,
                "indexers": ["MEDLINE"] if issn in medline_issns else [],
                "metrics": {
                    "cuiden": None
                }
            }

    for issn in scopus_nursing_issns:
        if issn not in journals:
            journals[issn] = {
                "title": "Periódico do Scopus (Enfermagem)",
                "area": "Enfermagem",
                "jcr": jcr_values.get(issn),
                "citeScore": None,
                "indexers": ["MEDLINE"] if issn in medline_issns else [],
                "metrics": {
                    "cuiden": None
                }
            }

    # --- 5. PROCESSAR CITESCORE (PLANILHA SEPARADA, SE DISPONÍVEL) ---
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

    # --- 6. PROCESSAR CITESCORE_CACHE.JSON (GERADO PELA API ELSEVIER) ---
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
            print(f"CiteScore (API Elsevier): {applied} periódicos atualizados do cache.")
        except Exception as e:
            print(f"Erro ao processar citescore_cache.json: {e}")

    # --- 7. GRAVAR RESULTADO EM JOURNALS.JSON ---
    print(f"Gravando base consolidada contendo {len(journals)} periódicos...")
    try:
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(journals, f, indent=2, ensure_ascii=False)
        print(f"Banco de dados compilado com sucesso e salvo em: {OUTPUT_PATH}")
    except Exception as e:
        print(f"Erro ao gravar arquivo journals.json: {e}")

if __name__ == "__main__":
    compile_database()
