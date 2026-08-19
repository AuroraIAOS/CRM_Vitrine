# seed/ — CRM Vitrine

Dados fictícios para popular o ambiente de demonstração (o CRM Vitrine é literalmente uma vitrine — precisa parecer usado).

## Como rodar

Os executáveis vivem em `crm/scripts/`, e não aqui, por um motivo prático: eles dependem de `@supabase/supabase-js` e `dotenv`, que só existem em `crm/node_modules` — não há `package.json` na raiz do repositório. É o mesmo lugar de `seed_test_users.mjs`.

```bash
cd crm
node scripts/seed_demo.mjs            # semeia (limpa a conta de demonstração antes, se existir)
node scripts/seed_demo.mjs --limpar   # só apaga
```

Exige no `.env` da raiz: `SUPABASE__URL`, `SUPABASE_SERVICE_ROLE_KEY` e `DEMO_SENHA`.

## Regras que o seed não pode quebrar

1. **Nenhum telefone real, nem inventado.** Os contatos usam o indicativo **+999**, reservado pela ITU e que não roteia para assinante nenhum. Não é "um número que parece falso" — é um número que não existe. O motivo está em `handoffs/instrucoes.md` §6: o provedor completa dígitos ao rotear, e um número plausível já atingiu terceiro num projeto irmão.
2. **Nenhuma credencial no repositório.** A senha da conta de demonstração vive só no `.env`, gitignorado.
3. **Nenhum dado real de cliente.** Todos os nomes são fictícios; o prefixo `[demo]` no nome da conta deixa a origem explícita.
4. **Sem escrita direta em tabela protegida.** `planos_cliente` e `saldos_plano` nascem por `aba_finance.vender_plano()` — o seed usa o caminho do produto, não um atalho por baixo (Qualidade da Subetapa 02.8).
5. **Sem chave de IA real.** `ia_configuracoes` recebe um marcador inequívoco e o agente nasce **desligado**: a tela mostra o módulo configurado sem fingir que responderia.

## Cobertura — como ela é verificada

O critério é **no mínimo 2 registros por estado** de cada tabela que tem estado (pedido de Max). A lista de estados não foi escrita de cabeça: saiu de uma varredura das **49 restrições `CHECK ... = ANY (ARRAY[...])`** dos schemas `aba_*`, e a cobertura foi conferida por consulta que conta cada valor e acusa o que ficar abaixo de 2.

Isso importa porque as três primeiras rodadas de verificação encontraram **16 lacunas que o log do próprio script dava como cobertas** — formas de pagamento com 1 registro, estados de modelo de mensagem ausentes por completo, `transmissoes` com 3 dos 5 estados. Confiar no script teria deixado tudo isso passar.

**Estado atual: 137 situações medidas, todas com ≥2 registros**, exceto quatro que a própria especificação de Max fixa em 1 — 1 proprietário, 1 recepcionista (admin), 1 auxiliar (viewer) e 1 profissional inativo.

### Equipe (especificada por Max)

| Papel | Quantidade | Quem |
|---|---|---|
| `owner` | 1 | Proprietária |
| `admin` | 1 | Recepcionista |
| `agent` | 4 | 3 profissionais ativos + 1 afastado |
| `viewer` | 1 | Auxiliar geral |

O teto de assentos da conta é elevado de 3 (padrão) para 10 pelo próprio seed — sem isso o trigger `enforce_seat_limit` recusa a partir da quarta pessoa. A mudança fica registrada em `licensing.limit_changes`.
