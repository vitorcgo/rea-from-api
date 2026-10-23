<div align="center">

[English](../../README.md) Â· **PortuguÃªs (Brasil)**

# rea-from-api

### Transforme os dados de qualquer site num cliente de API testado para o seu app.

**Viu num site um dado de que vocÃª precisa? Descubra exatamente como ele Ã© servido, com provas, e receba cÃ³digo tipado e testado.**

[O que dÃ¡ para fazer](#o-que-dÃ¡-para-fazer) Â· [InÃ­cio rÃ¡pido](#inÃ­cio-rÃ¡pido) Â· [Como funciona](#como-funciona) Â· [O que ele descobre](#o-que-ele-descobre) Â· [Showcase](#showcase) Â· [FAQ](#faq)

<code>npx rea-from-api setup</code>

<br /><br />

<img src="../assets/investigate.png" alt="ExecuÃ§Ã£o real do rea-from-api no pypi.org: 12 endpoints confirmados, com a estratÃ©gia que encontrou cada fonte" width="1100" />

</div>

---

Precisa dos produtos, preÃ§os, pacotes, anÃºncios ou estatÃ­sticas que um site mostra? PeÃ§a ao seu agente
para investigar com o rea-from-api. Ele descobre de onde os dados realmente vÃªm (uma API oficial, uma
especificaÃ§Ã£o OpenAPI publicada, as requisiÃ§Ãµes que a pÃ¡gina faz no navegador, uma rota de dados do
framework ou JSON embutido no HTML), prova cada fonte com requisiÃ§Ãµes somente leitura, registra a API
como **OpenAPI 3.1** e gera um **cliente TypeScript ou Python testado** para colocar no seu projeto.

Toda afirmaÃ§Ã£o vem com evidÃªncia: qual estratÃ©gia encontrou, a requisiÃ§Ã£o que confirmou e o hash dos
bytes. Nada Ã© inventado: uma rota vista sÃ³ no JavaScript continua *inferida* atÃ© uma resposta real
provÃ¡-la. A captura no navegador e a anÃ¡lise de bundles usam o motor [REA](https://github.com/morluto/rea).

## O que dÃ¡ para fazer

| VocÃª querâ€¦ | O rea-from-api entrega |
|---|---|
| **Mostrar o catÃ¡logo ou os preÃ§os de uma loja no seu app** | O endpoint de produtos, filtros e paginaÃ§Ã£o, e um cliente tipado com `listProducts()` / `iterateProducts()` |
| **Achar a API oficial que vocÃª nem sabia que existia** | Specs que o site publica (`/.well-known/api-catalog`, OpenAPI, `llms.txt`), listagens no APIs.guru e hosts `api.` / `developer.` dos logs de certificados |
| **Usar uma API que pede chave** | VerificaÃ§Ã£o com a **sua** chave (`--auth-env`) e um cliente que lÃª a chave do ambiente, sem nunca gravÃ¡-la |
| **Pegar dados de um site sem API** | JSON-LD, `__NEXT_DATA__` ou rotas de dados do framework viram um extrator com os mesmos testes |
| **Integrar os dados de uma SPA** | As chamadas fetch/XHR da pÃ¡gina, com corpos de resposta reais, schemas e paginaÃ§Ã£o |
| **Saber quando a integraÃ§Ã£o vai quebrar** | `monitor` reverifica a API depois e aponta mudanÃ§as que quebram; `diff` compara duas specs |
| **Usar suas ferramentas de API** | `openapi.json` para Postman, Insomnia, mock servers, linters ou qualquer gerador de cÃ³digo |
| **Colocar direto no seu projeto** | `--target ../meu-app` grava o cliente no projeto (TypeScript ou Python), com testes |

## InÃ­cio rÃ¡pido

Funciona em Windows, macOS e Linux com Node.js 22.18+.

```bash
npx rea-from-api setup
```

O `setup` detecta os seus agentes (Claude Code, Claude Desktop, Codex, Cursor, VS Code, Windsurf, Gemini
CLI ou o projeto atual), mostra o que vai mudar, pergunta antes de aplicar e faz backup de cada
configuraÃ§Ã£o. Reinicie os agentes depois. OpÃ§Ãµes: `--agent <id>`, `--all`, `--yes`, `--dry-run` e
`--uninstall`. Qualquer outro cliente MCP pode rodar `npx -y rea-from-api mcp`.

PeÃ§a ao agente:

```text
Investigue https://exemplo.com, descubra como ele disponibiliza os dados pÃºblicos de produtos,
me mostre as evidÃªncias e crie uma integraÃ§Ã£o TypeScript para o meu projeto.
```

Ou no terminal:

```bash
npx rea-from-api run https://exemplo.com --goal "dados pÃºblicos de produtos" --target ../meu-app --live
```

### APIs que exigem a sua chave

```powershell
$env:MINHA_CHAVE = "..."
npx rea-from-api run https://api.exemplo.com/docs --goal "dados de pedidos" `
  --auth-env MINHA_CHAVE --auth-header X-Api-Key     # ou: --auth-query api_key
```

A chave vai sÃ³ para a API do alvo e nunca aparece em relatÃ³rios, fixtures ou cÃ³digo gerado.

## Como funciona

<p align="center">
  <img src="../assets/how-it-works.svg" alt="URL e objetivo passam por 11 estratÃ©gias de descoberta; cada candidato Ã© verificado com requisiÃ§Ãµes somente leitura; o resultado Ã© um relatÃ³rio de evidÃªncias, um OpenAPI 3.1 e um cliente testado" width="1100" />
</p>

## O que ele descobre

| Fonte | O que retorna | Requisitos |
|---|---|---|
| DeclaraÃ§Ãµes do publicador | `api-catalog` (RFC 9727), `Link: rel=service-desc`, `ai-plugin.json`, `llms.txt` | nenhum |
| OpenAPI / Swagger / WordPress REST | OperaÃ§Ãµes documentadas (JSON ou YAML) | nenhum |
| DiretÃ³rios de APIs | Specs oficiais listadas no APIs.guru | internet |
| HistÃ³rico da web | URLs de API/JSON arquivadas pela Wayback Machine, reverificadas hoje | internet |
| Hosts de API | `api.*`, `developer.*` via Certificate Transparency (sÃ³ procura specs) | internet |
| Rotas de dados de frameworks | Next.js, Gatsby, Nuxt, SvelteKit, WooCommerce Store API, Shopify, Drupal JSON:API | framework detectado |
| TrÃ¡fego do navegador | fetch/XHR com corpos de resposta, num navegador real | Chrome, Edge ou Chromium |
| JavaScript | URLs, mÃ©todos e headers dos bundles; **source maps** recuperam os mÃ³dulos originais | jsluice opcional |
| GraphQL | Schema pela query de introspecÃ§Ã£o padrÃ£o | introspecÃ§Ã£o pÃºblica |
| Sua prÃ³pria sessÃ£o | HAR gravado por vocÃª, lido offline com credenciais ocultadas | nenhum |
| HTML | JSON-LD, `__NEXT_DATA__`, estado inline, formulÃ¡rios GET | nenhum |

## Showcase

<p align="center">
  <img src="../assets/client.png" alt="O cliente gerado passa em typecheck, testes offline, testes ao vivo e no exemplo, e devolve metadados reais do PyPI" width="900" />
</p>

- **PyPI** ([`examples/pypi/`](../../examples/pypi)): o navegador viu 7 requisiÃ§Ãµes de dados, a Wayback
  Machine trouxe 1.000 URLs arquivadas e os logs de certificados apontaram `docs.pypi.org`. Rotas de conta
  achadas no JavaScript foram recusadas. A JSON API do PyPI Ã© bloqueada para robÃ´s no `robots.txt`, entÃ£o sÃ³
  foi verificada com `--robots-exempt` explÃ­cito, e virou um cliente que passou em tudo e devolveu dados ao
  vivo.
- **Loja SPA de teste**: uma investigaÃ§Ã£o acha a API no trÃ¡fego do navegador, um catÃ¡logo RFC 9727 com spec
  YAML, a listagem no APIs.guru, uma URL morta da Wayback, um endpoint que sÃ³ existe no TypeScript original
  recuperado do source map, uma rota que sÃ³ funciona com a chave do usuÃ¡rio, o schema GraphQL e uma rota de
  dados do Next.js, e gera clientes TypeScript e Python que passam nos prÃ³prios testes.
- **Schemathesis** encontrou campos que podem vir `null` e nunca apareceram nas amostras.

## SeguranÃ§a

SÃ³ requisiÃ§Ãµes somente leitura sÃ£o automÃ¡ticas (mais a query de introspecÃ§Ã£o GraphQL padrÃ£o); respeita
`robots.txt`; nÃ£o chama rotas de conta, admin, login, checkout ou exclusÃ£o; 401/403 significam "use a **sua**
credencial"; para em CAPTCHA/desafio anti-bot sem contorno; orÃ§amentos com limite; nenhum segredo em
relatÃ³rios ou cÃ³digo. Detalhes em [docs/safety.md](../safety.md).

## FAQ

- **Ã‰ sÃ³ um scraper com navegador?** NÃ£o. O navegador Ã© uma de onze estratÃ©gias; todas as outras funcionam com
  `--browser off`. O objetivo Ã© a *API* por trÃ¡s da pÃ¡gina, verificada e tipada.
- **Acha endpoints nÃ£o documentados?** Sim, os que o prÃ³prio site usa, sempre rotulados como nÃ£o documentados.
  Verifique os termos de uso; o `monitor` avisa quando mudam.
- **E se precisar de chave ou login?** Use a sua chave com `--auth-env` ou um HAR da **sua** sessÃ£o (`--har`).
  Nada Ã© extraÃ­do do site e nenhuma autenticaÃ§Ã£o Ã© contornada.
- **Envia meu alvo para terceiros?** As fontes passivas enviam sÃ³ o domÃ­nio para APIs.guru, Wayback Machine e
  crt.sh; desative com `--passive off`.

## CrÃ©ditos e licenÃ§a

MIT. A captura no navegador, a anÃ¡lise de bundles e a leitura de HAR usam a
[REA (Reverse Engineer Anything)](https://github.com/morluto/rea), do morluto (MIT), como dependÃªncia sem
modificaÃ§Ãµes; o rea-from-api Ã© um projeto independente.
