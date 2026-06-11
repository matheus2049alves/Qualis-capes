# Contexto do Projeto: Classificador Automatizado de Artigos Científicos (Qualis Capes Enfermagem)

## 1. Visão Geral do Problema
O processo manual de classificação de artigos científicos publicados por professores da área de Enfermagem, seguindo os critérios da CAPES (Coordenação de Aperfeiçoamento de Pessoal de Nível Superior), é exaustivo, repetitivo e propenso a erros. 

Atualmente, o fluxo de trabalho manual consiste em:
1. **Identificação da Revista:** Identificar onde o artigo foi publicado.
2. **Validação de Área (Plataforma Sucupira):** Consultar se a revista pertence explicitamente à área de **Enfermagem** ou se enquadra em **Outras Áreas**.
3. **Mapeamento de Indexadores e Métricas:** Verificar em quais bases de dados a revista está indexada (JCR, CiteScore, Medline, SciELO, LILACS, BDENF, CUIDEN, Latindex) e coletar seus respectivos índices de impacto (valores de JCR e CiteScore).
4. **Aplicação da Regra do Melhor Caso:** Comparar os dados encontrados com a tabela de estratos da CAPES (de A1 a A8 ou Não Classificada - NC) e atribuir ao artigo a **melhor classificação possível** baseada no indexador mais vantajoso.

## 2. Objetivo da Aplicação
Desenvolver uma ferramenta de software (ou script de automação) que receba dados identificadores de um artigo (como DOI ou ISSN da revista) e realize todo o processo de enriquecimento de dados e classificação de forma 100% automatizada, devolvendo o estrato final (Qualis) correto.

---

## 3. Regras de Negócio e Lógica de Classificação

O sistema deve aplicar estritamente a tabela oficial da CAPES fornecida. A lógica opera em cascata (do estrato mais alto A1 para o mais baixo A8). O sistema deve testar as condições na ordem abaixo e parar assim que a primeira condição for satisfeita.

### Cenário A: Revista da Área de ENFERMAGEM
* **Estrato A1:** Se `JCR >= 1.8` **OU** `CiteScore >= 2.9`.
* **Estrato A2:** Se `JCR` entre `1.1 e 1.7` **OU** `CiteScore` entre `1.8 e 2.8`.
* **Estrato A3:** Se `JCR` entre `0.6 e 1.0` **OU** `CiteScore` entre `0.7 e 1.7` **OU** indexada no `MEDLINE`.
* **Estrato A4:** Se `JCR` entre `0.1 e 0.5` **OU** `CiteScore` entre `0.1 e 0.6` **OU** indexada no `SCIELO` **OU** indexada no `RevEnf`.
* **Estrato A5:** Se indexada no `LILACS` **OU** `BDENF`.
* **Estrato A6:** Se indexada no `RIC/CUIDEN` com valor `>= 1.5`.
* **Estrato A7:** Se indexada no `CINAHL` **OU** indexada no `RIC/CUIDEN` com valor entre `0.1 e 1.4`.
* **Estrato A8:** Se indexada no `Latindex`.
* **Estrato NC (Não Classificada):** Se não atender a nenhuma das condições anteriores ou for explicitamente marcada como não classificada nas bases.

### Cenário B: Revista de OUTRAS ÁREAS
* **Estrato A1:** Se `JCR >= 5` **OU** `CiteScore >= 5`.
* **Estrato A2:** Se `JCR` entre `4.0 e 4.9` **OU** `CiteScore` entre `4.0 e 4.9`.
* **Estrato A3:** Se `JCR` entre `3.0 e 3.9` **OU** `CiteScore` entre `3.0 e 3.9`.
* **Estrato A4:** Se `JCR` entre `2.0 e 2.9` **OU** `CiteScore` entre `2.0 e 2.9`.
* **Estrato A5:** Se `JCR` entre `1.0 e 1.9` **OU** `CiteScore` entre `0.1 e 1.9` **OU** indexada no `MEDLINE`.
* **Estrato A6:** Se `JCR` entre `0.1 e 0.9` **OU** indexada no `SCIELO`.
* **Estrato A7:** Se indexada no `LILACS`.
* **Estrato A8:** Se indexada no `Latindex`.
* **Estrato NC (Não Classificada):** Se não atender a nenhuma das condições anteriores ou for explicitamente marcada como não classificada nas bases.

---

## 4. Requisitos Funcionais 

1.  **Módulo de Entrada:** O sistema deve aceitar a entrada de dados (via input de texto simples, lote de ISSNs ou upload de arquivo CSV/Excel contendo uma lista de artigos/revistas).
2.  **Módulo de Consulta/Enriquecimento:**
    * Verificar o pertencimento à área de Enfermagem (pode usar um mapeamento local pré-carregado do Qualis Sucupira ou simular/consultar dados da plataforma).
    * Obter métricas de impacto (JCR e CiteScore) correspondentes ao ISSN da revista.
    * Verificar a presença do ISSN nos indexadores específicos (SciELO, Medline, Scopus, etc.).
3.  **Módulo de Processamento (Engine de Decisão):** Implementar a árvore de decisão descrita na seção de Regras de Negócio, priorizando sempre o melhor estrato alcançável pelo artigo ("regra do melhor caso").
4.  **Módulo de Saída:** Exibir ou exportar o resultado estruturado (ex: Tabela contendo *Título do Artigo, ISSN, Área Encontrada, JCR, CiteScore, Indexadores Ativos, Estrato Final Atribuído e Justificativa da Regra*).

## 5. Instruções para os Agentes de IA
* **Simplicidade e Modularidade:** Separe a lógica de *busca/Scraping/API* da lógica de *classificação* (regras da tabela).
* **Tratamento de Exceções:** Caso uma revista possua JCR correspondente a um estrato (ex: A3) e indexação que garanta outro (ex: A4), certifique-se de que o código escolha o maior estrato possível (A3).
* **Mock de Dados (Se necessário):** Se o acesso em tempo real às APIs fechadas (como Clarivate/JCR ou Scopus) for restrito, estruture o código para ler essas métricas a partir de arquivos locais de referência (CSVs ou dicionários JSON) mapeados por ISSN.