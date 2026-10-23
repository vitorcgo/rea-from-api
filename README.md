<div align="center">

**Português (Brasil)** · [English](docs/readme/README_en.md)

# rea-from-api

### Transforme os dados de qualquer site num cliente de API testado para o seu app.

**Viu num site um dado de que você precisa? Descubra exatamente como ele é servido, com provas, e receba código tipado e testado.**

[![npm version](https://img.shields.io/npm/v/rea-from-api?style=flat-square&color=cb3837)](https://www.npmjs.com/package/rea-from-api)
[![CI](https://github.com/vitorcgo/rea-from-api/actions/workflows/ci.yml/badge.svg)](https://github.com/vitorcgo/rea-from-api/actions/workflows/ci.yml)
[![MCP server](https://img.shields.io/badge/MCP-12_ferramentas-5c4ee5?style=flat-square)](#ferramentas-mcp)
[![OpenAPI 3.1](https://img.shields.io/badge/sa%C3%ADda-OpenAPI_3.1-6BA539?style=flat-square&logo=openapiinitiative&logoColor=white)](docs/evidence-model.md)
[![Windows · macOS · Linux](https://img.shields.io/badge/plataformas-Windows_·_macOS_·_Linux-555?style=flat-square)](#início-rápido)
[![MIT license](https://img.shields.io/badge/licen%C3%A7a-MIT-f4c430?style=flat-square)](LICENSE)

[O que dá para fazer](#o-que-dá-para-fazer) · [Início rápido](#início-rápido) · [Como funciona](#como-funciona) · [O que ele descobre](#o-que-ele-descobre) · [Benchmark](#benchmark) · [Showcase](#showcase) · [FAQ](#faq) · [Docs](#documentação)

<code>npx rea-from-api setup</code>

<br /><br />

<img src="docs/assets/investigate.png" alt="Execução real do rea-from-api no pypi.org: 12 endpoints confirmados, com a estratégia que encontrou cada fonte" width="1100" />

</div>

---

Precisa dos produtos, preços, pacotes, anúncios ou estatísticas que um site mostra? Peça ao seu agente
para investigar com o rea-from-api. Ele descobre de onde os dados realmente vêm (uma API oficial, uma
especificação OpenAPI publicada, as requisições que a página faz no navegador, uma rota de dados do
framework ou JSON embutido no HTML), prova cada fonte com requisições somente leitura, registra a API
como **OpenAPI 3.1** e gera um **cliente TypeScript ou Python testado** para colocar no seu projeto.

Toda afirmação vem com evidência: qual estratégia encontrou, a requisição que confirmou e o hash dos
bytes. Nada é inventado: uma rota vista só no JavaScript continua *inferida* até uma resposta real
prová-la. A captura no navegador e a análise de bundles usam o motor [REA](https://github.com/morluto/rea).

## O que dá para fazer

| Você quer… | O rea-from-api entrega |
|---|---|
| **Mostrar o catálogo ou os preços de uma loja no seu app** | O endpoint de produtos, filtros e paginação, e um cliente tipado com `listProducts()` / `iterateProducts()` |
| **Achar a API oficial que você nem sabia que existia** | Specs que o site publica (`/.well-known/api-catalog`, OpenAPI, `llms.txt`), listagens no APIs.guru e hosts `api.` / `developer.` dos logs de certificados |
| **Usar uma API que pede chave** | Verificação com a **sua** chave (`--auth-env`) e um cliente que lê a chave do ambiente, sem nunca gravá-la |
| **Pegar dados de um site sem API** | JSON-LD, `__NEXT_DATA__` ou rotas de dados do framework viram um extrator com os mesmos testes |
| **Integrar os dados de uma SPA** | As chamadas fetch/XHR da página, com corpos de resposta reais, schemas e paginação |
| **Saber quando a integração vai quebrar** | `monitor` reverifica a API depois e aponta mudanças que quebram; `diff` compara duas specs |
| **Usar suas ferramentas de API** | `openapi.json` para Postman, Insomnia, mock servers, linters ou qualquer gerador de código |
| **Colocar direto no seu projeto** | `--target ../meu-app` grava o cliente no projeto (TypeScript ou Python), com testes |

## Início rápido

Funciona em Windows, macOS e Linux com Node.js 22.18+.

### Configure o seu agente

```bash
npx rea-from-api setup
```

O `setup` detecta os seus agentes, mostra exatamente o que vai mudar, pergunta antes de aplicar e faz
backup de cada configuração. Reinicie os agentes depois.

| Agente | `--agent` | Configuração |
|---|---|---|
| Claude Code | `claude-code` | `~/.claude.json` + `~/.claude/skills/rea-from-api` |
| Claude Desktop | `claude-desktop` | `claude_desktop_config.json` |
| Codex | `codex` | `~/.codex/config.toml` |
| Cursor | `cursor` | `~/.cursor/mcp.json` |
| VS Code (Copilot) | `vscode` | `mcp.json` do usuário |
| Windsurf | `windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` |
| Projeto atual | `project` | `.mcp.json` + `.claude/skills/rea-from-api` |

`--agent <id>` (pode repetir) ou `--all` escolhem os agentes sem perguntar, `--yes` pula a confirmação,
`--dry-run` só mostra o plano e `--uninstall` remove tudo o que o setup adicionou. Qualquer outro cliente
MCP pode rodar `npx -y rea-from-api mcp`.

### Peça ao agente

```text
Investigue https://exemplo.com, descubra como ele disponibiliza os dados públicos de produtos,
me mostre as evidências e crie uma integração TypeScript para o meu projeto.
```

### Ou use o terminal

```bash
npx rea-from-api run https://exemplo.com --goal "dados públicos de produtos" --target ../meu-app --live
```

`run` = `investigate` → `plan` → `generate` → `validate`. Cada etapa também roda sozinha; veja
`npx rea-from-api help`. `npx rea-from-api doctor` mostra quais motores opcionais estão disponíveis.

### APIs que exigem a sua chave

A maioria das APIs oficiais pede uma chave. Coloque a **sua** chave numa variável de ambiente e passe o
nome dela. A chave vai só para a API do alvo e nunca aparece em relatórios, fixtures ou código gerado.

```bash
export MINHA_CHAVE=...           # PowerShell: $env:MINHA_CHAVE = "..."
npx rea-from-api run https://api.exemplo.com/docs --goal "dados de pedidos" \
  --auth-env MINHA_CHAVE --auth-header X-Api-Key        # ou: --auth-query api_key
```

## Como funciona

<p align="center">
  <img src="docs/assets/how-it-works.svg" alt="URL e objetivo passam por 11 estratégias de descoberta; cada candidato é verificado com requisições somente leitura; o resultado é um relatório de evidências, um OpenAPI 3.1 e um cliente testado" width="1100" />
</p>

O agente chama pelo MCP as mesmas operações que você roda no terminal. Os resultados são resumos curtos
com os caminhos dos artefatos completos: `findings.md`, `endpoints.json`, `evidence.json`,
`openapi.json`, `plan.md` e `validation.md`.

## O que ele descobre

| Fonte | O que retorna | Requisitos |
|---|---|---|
| Declarações do publicador | `api-catalog` ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727)), `Link: rel=service-desc`, `ai-plugin.json`, `llms.txt` → specs e docs | nenhum |
| OpenAPI / Swagger / WordPress REST | Operações documentadas (JSON ou YAML) | nenhum |
| Diretórios de APIs | Specs oficiais listadas no [APIs.guru](https://apis.guru) para o domínio | internet |
| Histórico da web | URLs de API/JSON arquivadas pela Wayback Machine, reverificadas hoje | internet |
| Hosts de API | `api.*`, `developer.*` via Certificate Transparency, checados atrás de specs | internet |
| Rotas de dados de frameworks | Next.js `/_next/data`, Gatsby `page-data`, Nuxt `_payload`, SvelteKit `__data`, WooCommerce Store API, JSON de vitrine Shopify, Drupal JSON:API | framework detectado |
| Tráfego do navegador | Requisições fetch/XHR com corpos de resposta, capturadas num navegador real | Chrome, Edge ou Chromium |
| JavaScript | URLs, métodos e headers dos bundles; **source maps** recuperam os módulos originais da API | [jsluice](https://github.com/BishopFox/jsluice) opcional |
| GraphQL | O schema pela query de introspecção padrão | introspecção pública |
| Sua própria sessão | Um HAR gravado por você, lido offline com credenciais ocultadas | nenhum |
| HTML | JSON-LD, `__NEXT_DATA__`, estado inline, formulários GET, pistas de tecnologia | nenhum |

| Saída | Detalhes |
|---|---|
| Evidências | Cada endpoint: confirmado / observado / inferido / indisponível, status de teste, confiança, relevância para o objetivo, ids de evidência |
| OpenAPI 3.1 | `investigation/openapi.json` com a origem de cada operação |
| Clientes | TypeScript (zero dependências em runtime) ou Python 3.9+ (só biblioteca padrão): tipos, validação, paginação, cache, retentativas, timeouts, logs sem segredos |
| Testes | Testes com fixtures gravadas, testes de retry/cache/paginação, testes ao vivo opcionais e um exemplo executável |
| Conformidade | Testes baseados em propriedades com [Schemathesis](https://schemathesis.io) nas operações somente leitura confirmadas |
| Mudanças | Mudanças estruturais e classificação de quebras com [oasdiff](https://github.com/oasdiff/oasdiff) |

Motores opcionais são detectados, nunca instalados por conta própria: `jsluice`, `schemathesis`, `oasdiff`, `mypy`.

## Benchmark

<!-- benchmark -->

## Showcase

### PyPI: de uma página de projeto a um cliente devolvendo dados ao vivo

<p align="center">
  <img src="docs/assets/client.png" alt="O cliente gerado passa em typecheck, testes offline, testes ao vivo e no exemplo, e devolve metadados reais do PyPI" width="900" />
</p>

Um único `run` em `https://pypi.org/project/requests/` (saída acima e em [`examples/pypi/`](examples/pypi)).
O navegador viu 7 requisições de dados, a Wayback Machine trouxe 1.000 URLs arquivadas para checar e os logs
de certificados apontaram `docs.pypi.org`. Rotas de conta achadas no JavaScript foram recusadas pelo
verificador. A JSON API do PyPI é bloqueada para robôs no `robots.txt`, então só foi verificada depois de um
`--robots-exempt` explícito para a API documentada, e virou um cliente que passou em todas as checagens e
devolveu dados ao vivo.

### Uma loja SPA: todas as conexões de uma vez

O site de teste ([`tests/fixtures/site.ts`](tests/fixtures/site.ts)) esconde os dados atrás de chamadas fetch.
Uma investigação acha a API de produtos no tráfego do navegador, um catálogo RFC 9727 apontando para uma spec
YAML, uma listagem no APIs.guru, uma URL morta da Wayback (verificada como inexistente), um endpoint de
avaliações que existe **só no TypeScript original recuperado do source map**, um endpoint de parceiro que só
funciona com a chave do próprio usuário, o schema GraphQL e uma rota de dados do Next.js, e então gera
clientes TypeScript e Python que passam nos próprios testes. O `npm test` roda tudo isso em Windows, macOS e
Linux.

### Testes de conformidade acham o que as amostras escondiam

No mesmo site, o Schemathesis apontou que `page`, `total_pages` e `next` podem vir `null`, o que nunca
aconteceu nas páginas gravadas. Exportar OpenAPI faz o contrato descoberto ser testado além dos exemplos que
você por acaso observou.

## Segurança

Só requisições somente leitura são enviadas automaticamente (mais uma query de introspecção GraphQL padrão).
O `robots.txt` é respeitado; rotas de conta, admin, login, checkout e exclusão nunca são chamadas; 401/403 e
redirecionamentos para login significam "use a **sua** credencial"; desafios anti-bot e CAPTCHAs param a
execução, sem contorno. Requisições, tempo e retentativas têm limites rígidos. Cookies, tokens e chaves nunca
chegam a relatórios, fixtures ou código gerado, e o conteúdo dos sites é tratado como dado, nunca como
instrução. Detalhes em [docs/safety.md](docs/safety.md).

## Ferramentas MCP

`investigate` · `list_endpoints` · `get_endpoint` · `read_findings` · `export_openapi` ·
`plan_integration` · `generate_integration` · `validate_integration` · `run_conformance` ·
`diff_specs` · `monitor` · `doctor`

## FAQ

<details>
<summary><strong>É só um scraper com navegador headless?</strong></summary>

Não. O navegador é uma de onze estratégias. Declarações do publicador, sondagem de OpenAPI, convenções de
frameworks, APIs.guru, Wayback Machine, Certificate Transparency, análise de JavaScript e source maps e
introspecção GraphQL funcionam sem navegador (`--browser off`). O objetivo é a *API* por trás da página,
verificada e tipada, não HTML raspado.
</details>

<details>
<summary><strong>Ele acha endpoints não documentados?</strong></summary>

Acha os endpoints que o próprio site usa e verifica os somente leitura. Eles ficam marcados como não
documentados: podem mudar sem aviso e o reuso pode ser restrito pelos termos do site. Confira os termos antes
de depender dos dados; o `monitor` avisa quando algo muda.
</details>

<details>
<summary><strong>E se a API precisar de chave ou login?</strong></summary>

Endpoints que respondem 401/403 ou redirecionam para login ficam marcados como `auth: required`. Use a sua
chave com `--auth-env` (veja [APIs que exigem a sua chave](#apis-que-exigem-a-sua-chave)) ou grave um HAR da
**sua** sessão e passe `--har`. Nada é extraído do site e nenhuma autenticação é contornada.
</details>

<details>
<summary><strong>Quais agentes podem usar?</strong></summary>

Qualquer agente com suporte a MCP local. O `setup` configura Claude Code, Claude Desktop, Codex, Cursor,
VS Code, Windsurf, Gemini CLI ou um `.mcp.json` de projeto; qualquer outro pode rodar `npx -y rea-from-api mcp`.
</details>

<details>
<summary><strong>Ele envia o meu alvo para algum lugar?</strong></summary>

As fontes passivas enviam só o nome do domínio para APIs.guru, Wayback Machine e crt.sh; desative com
`--passive off`. Todo o resto roda na sua máquina. O provedor do modelo do seu agente tem a própria política
de dados.
</details>

## Documentação

- [Fluxo e estratégias](docs/workflow.md): ordem, limites, códigos de saída
- [Modelo de evidências](docs/evidence-model.md): campos de endpoint e evidência, extensões OpenAPI
- [Segurança e limites](docs/safety.md)
- [Pesquisa por trás do design](docs/research.md)
- [Como estender](docs/extending.md): novas estratégias e geradores
- [Integração com o motor](docs/rea-integration.md)
- [`SKILL.md`](SKILL.md): instruções para agentes

A documentação detalhada está em inglês.

## Desenvolvimento

```bash
git clone https://github.com/vitorcgo/rea-from-api && cd rea-from-api
npm install
npm run typecheck
npm test        # testes unitários, de pipeline, MCP, setup e geradores contra um site local
npm run build   # compila o dist/ (o que o pacote npm executa)
node benchmark/run.mjs   # benchmark em sites reais (veja benchmark/)
```

Um checkout roda os fontes TypeScript direto; `node bin/rea-from-api.mjs setup` liga a skill a ele. O CI
roda a suíte em Windows, macOS e Linux com Node 22 e 24 e instala o pacote empacotado num diretório limpo.

## Créditos e licença

MIT, veja [LICENSE](LICENSE). A captura no navegador, a análise de bundles e a leitura de HAR usam a
[REA (Reverse Engineer Anything)](https://github.com/morluto/rea), do morluto (MIT), como dependência sem
modificações; o rea-from-api é um projeto independente. Avisos de terceiros:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
