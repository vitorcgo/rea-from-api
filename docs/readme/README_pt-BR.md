<div align="center">

[English](../../README.md) · **Português (Brasil)**

# rea-from-api: Reverse Engineer Any API

### Um MCP para descobrir, provar e integrar os dados por trás de qualquer site.

**Viu num site um dado de que você precisa? Descubra exatamente como ele é servido — com evidências — e receba um cliente testado.**

[Início rápido](#início-rápido) · [Como funciona](#como-funciona) · [O que dá para descobrir](#o-que-dá-para-descobrir) · [Showcases](#showcases) · [FAQ](#faq) · [Documentação](#documentação)

<code>npx rea-from-api setup</code>

</div>

> [!IMPORTANT]
> O rea-from-api é um projeto independente construído **sobre** a [REA](https://github.com/morluto/rea),
> do morluto, e não é afiliado a ela. Obtenha a REA apenas em [morluto/rea](https://github.com/morluto/rea),
> [rea.tools](https://rea.tools/) ou no pacote npm [rea-agents](https://www.npmjs.com/package/rea-agents) —
> o rea-from-api instala esse pacote como dependência com versão fixa.

---

Precisa da lista de produtos, preços, pacotes, anúncios ou estatísticas que um site mostra? Peça ao seu
agente para investigar com o rea-from-api. Ele descobre de onde os dados realmente vêm — uma API oficial,
uma especificação OpenAPI declarada pelo publicador, as chamadas XHR de uma SPA, uma rota de dados do
framework ou JSON embutido no HTML —, verifica cada fonte com requisições somente leitura, registra a API
observada como **OpenAPI 3.1** e gera um **cliente TypeScript ou Python testado** para o seu projeto.

Toda afirmação tem evidência: qual estratégia encontrou, a requisição que confirmou, o SHA-256 dos bytes e
os ids de Evidence da própria REA quando o navegador ou a análise de bundle dela observou. Endpoints nunca
são inventados: uma rota vista no JavaScript continua *inferida* até que uma resposta real a prove.

A REA é o motor de engenharia reversa do lado do navegador (captura via Playwright com corpos de resposta,
análise AST de bundles, leitura de HAR/mitmproxy/SAZ). O rea-from-api adiciona a camada de API que a REA
não tem: conexões de descoberta além do navegador, replay e verificação, inferência de schema e paginação,
exportação OpenAPI, testes de conformidade, monitoramento de drift e geração de código.

## Início rápido

Funciona em Windows, macOS e Linux com Node.js 22.18+ e npm.

```bash
npx rea-from-api setup
npx rea-from-api doctor
```

O `setup` detecta os seus agentes (Claude Code, Claude Desktop, Codex, Cursor, VS Code, Windsurf, Gemini
CLI ou o projeto atual), mostra o que vai mudar e pergunta antes de aplicar. Ele registra o servidor MCP
(com backup de cada configuração) e instala a skill. Reinicie os agentes depois. Opções: `--agent <id>`,
`--all`, `--yes`, `--dry-run` e `--uninstall`. Qualquer outro cliente MCP pode rodar
`npx -y rea-from-api mcp`.

### APIs que exigem a sua chave

A maioria das APIs oficiais pede uma chave. Passe **a sua própria** por variável de ambiente: ela vai só
para a API do alvo, é verificada como todo o resto e nunca aparece em relatórios, fixtures ou código
gerado. O cliente gerado lê a chave do ambiente do mesmo jeito.

```powershell
$env:MINHA_CHAVE = "..."
npx rea-from-api run https://api.exemplo.com/docs --goal "dados de pedidos" `
  --auth-env MINHA_CHAVE --auth-header X-Api-Key     # ou: --auth-query api_key
```

Peça ao agente:

```text
Investigue https://exemplo.com, descubra como ele disponibiliza os dados públicos de produtos,
me mostre as evidências e crie uma integração TypeScript para o meu projeto.
```

Ou no terminal:

```bash
npx rea-from-api run https://exemplo.com \
  --goal "dados públicos de produtos" --target ../meu-projeto --language python --live --fuzz
```

## Como funciona

Descoberta (publicador, fontes passivas, convenções de framework, REA, análise estática) → verificação
somente leitura (schema, paginação, autenticação, rate limit) → `evidence.json` + `findings.md` +
`openapi.json` → conformidade (Schemathesis) e drift (oasdiff) → plano com diagrama Mermaid → cliente
TypeScript/Python com testes → validação (typecheck, offline, live, exemplo). O diagrama completo está no
[README em inglês](../../README.md#how-it-works).

## O que dá para descobrir

| Fonte | O que retorna | Requisitos |
|---|---|---|
| APIs declaradas pelo publicador | `/.well-known/api-catalog` (RFC 9727), `Link: rel=service-desc`, `ai-plugin.json`, `llms.txt` | nenhum |
| OpenAPI / Swagger / WordPress REST | Operações documentadas (JSON ou YAML) | nenhum |
| Diretórios públicos | Specs oficiais no APIs.guru | acesso a api.apis.guru |
| Histórico da web | URLs de API/JSON arquivadas pela Wayback Machine, reverificadas | acesso a web.archive.org |
| Hosts de API | `api.*`, `developer.*` via Certificate Transparency (só procura specs) | acesso a crt.sh |
| Rotas de dados de frameworks | Next.js, Gatsby, Nuxt, SvelteKit, WooCommerce Store API, Shopify, Drupal JSON:API | framework identificado |
| Tráfego do navegador | fetch/XHR com corpos via REA `capture-browser-scenario` | REA + Chromium |
| Bundles JS | REA `analyze-web-bundle`, jsluice (métodos, headers, params), **source maps** | REA + Chromium; jsluice opcional |
| GraphQL | Schema pela query de introspecção padrão (sem brute force) | introspecção pública |
| Sua própria sessão | HAR/mitmproxy/SAZ gravado por você, lido offline pela REA | REA |
| HTML | JSON-LD, `__NEXT_DATA__`, estado inline, formulários GET | nenhum |

## Showcases

- **PyPI** ([`examples/pypi/`](../../examples/pypi)): saída real e não editada; o `robots.txt` do PyPI bloqueia a
  JSON API para crawlers, então ela só foi verificada com `--seed` + `--robots-exempt` explícitos, e rotas de
  conta encontradas no JS foram recusadas pelo verificador.
- **Loja SPA de teste**: uma investigação acha a API no tráfego da REA, um catálogo RFC 9727 com spec YAML,
  a listagem no APIs.guru, uma URL morta da Wayback, um endpoint que só existe no TypeScript original
  recuperado do source map, o schema GraphQL e uma rota de dados do Next.js — e gera clientes TypeScript e
  Python que passam nos próprios testes.
- **Schemathesis** encontrou campos que podem vir `null` e nunca apareceram nas amostras.

## Segurança

Só `GET`/`HEAD` automáticos (mais a query de introspecção GraphQL padrão); respeita `robots.txt`; não chama
rotas de conta, admin, login, checkout ou exclusão; 401/403 e redirecionamento para login exigem a credencial
**do próprio usuário**; para em CAPTCHA/desafio anti-bot sem contorno; orçamentos com teto; nenhum segredo em
relatórios ou código. Detalhes em [docs/safety.md](../safety.md).

## FAQ

- **Só funciona com navegador/Playwright?** Não. O navegador (via REA) é uma de onze estratégias; todas as
  outras funcionam com `--browser off`.
- **Acha endpoints não documentados?** Sim, os que o próprio site usa — sempre rotulados como não
  documentados. Verifique os termos de uso antes de depender deles.
- **E se precisar de chave ou login?** O endpoint é marcado `auth: required`. Use a sua chave com `--auth-env`
  ou um HAR da **sua** sessão (`--har`). Nada é extraído do site e nenhuma autenticação é contornada.
- **Envia meu alvo para terceiros?** As fontes passivas enviam só o domínio para APIs.guru, Wayback Machine e
  crt.sh; desative com `--passive off`.

## Documentação

[Pesquisa](../research.md) · [Fluxo e estratégias](../workflow.md) · [Modelo de evidências](../evidence-model.md) ·
[Uso da REA](../rea-integration.md) · [Auditoria da REA](../rea-audit.md) · [Segurança](../safety.md) ·
[Extensão](../extending.md) · [SKILL.md](../../SKILL.md)

## Licença

MIT. A REA é MIT © 2026 morluto, usada como dependência npm sem modificações.
