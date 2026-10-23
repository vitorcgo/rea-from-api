<div align="center">

[English](../../README.md) · **Português (Brasil)**

# rea-from-api: Reverse Engineer Any API

### Um MCP para descobrir, provar e integrar os dados por trás de qualquer site.

**Viu num site um dado de que você precisa? Descubra exatamente como ele é servido — com evidências — e receba um cliente testado.**

[Início rápido](#início-rápido) · [Como funciona](#como-funciona) · [O que dá para descobrir](#o-que-dá-para-descobrir) · [Showcases](#showcases) · [FAQ](#faq) · [Documentação](#documentação)

<code>node bin/rea-from-api.mjs setup --agent claude-code</code>

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

Requer Node.js 22.18+ (o TypeScript roda direto, sem build) e npm.

```bash
git clone https://github.com/vitorcgo/rea-from-api && cd rea-from-api
npm install
node bin/rea-from-api.mjs doctor
node bin/rea-from-api.mjs setup --agent claude-code   # ou: cursor, gemini, project (.mcp.json)
```

O `setup` registra o servidor MCP `rea-from-api` (com backup da configuração existente) e vincula a skill
(`SKILL.md`). Reinicie o agente depois. `--dry-run` mostra as mudanças sem aplicá-las.

Peça ao agente:

```text
Investigue https://exemplo.com, descubra como ele disponibiliza os dados públicos de produtos,
me mostre as evidências e crie uma integração TypeScript para o meu projeto.
```

Ou no terminal:

```bash
node bin/rea-from-api.mjs run https://exemplo.com \
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
- **E se precisar de login?** O endpoint é marcado `auth: required`. Use um HAR da **sua** sessão (`--har`) ou
  configure o seu token na variável de ambiente do cliente gerado.
- **Envia meu alvo para terceiros?** As fontes passivas enviam só o domínio para APIs.guru, Wayback Machine e
  crt.sh; desative com `--passive off`.

## Documentação

[Pesquisa](../research.md) · [Fluxo e estratégias](../workflow.md) · [Modelo de evidências](../evidence-model.md) ·
[Uso da REA](../rea-integration.md) · [Auditoria da REA](../rea-audit.md) · [Segurança](../safety.md) ·
[Extensão](../extending.md) · [SKILL.md](../../SKILL.md)

## Licença

MIT. A REA é MIT © 2026 morluto, usada como dependência npm sem modificações.
