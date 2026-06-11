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
            
            for idx, row in df_jcr.iterrows():
                raw_issn = row.get('ISSN')
                raw_eissn = row.get('eISSN')
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                jcr_val = parse_float(row.get('2024 JIF'))
                title = str(row.get('Journal name', '')).strip()
                
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
            
            for idx, row in df_scopus.iterrows():
                raw_issn = row.get('ISSN')
                raw_eissn = row.get('EISSN')
                
                issn = normalize_issn(raw_issn)
                eissn = normalize_issn(raw_eissn)
                
                medline_sourced = str(row.get('Medline-sourced Title? (See additional details under separate tab.)', '')).strip().upper()
                is_medline = medline_sourced in ['YES', 'Y']
                
                title = str(row.get('Source Title', '')).strip()
                
                for target_issn in [issn, eissn]:
                    if not target_issn:
                        continue
                    
                    if target_issn not in journals:
                        journals[target_issn] = {
                            "title": title,
                            "area": "Outras Áreas",
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
                        if title and not journals[target_issn]["title"]:
                            journals[target_issn]["title"] = title
            
            print("Scopus/Medline processado com sucesso.")
        except Exception as e:
            print(f"Erro ao processar journals_scopus.xlsx: {e}")
    else:
        print(f"AVISO: {SCOPUS_PATH} não encontrado. Indexadores Medline não serão atualizados.")

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
