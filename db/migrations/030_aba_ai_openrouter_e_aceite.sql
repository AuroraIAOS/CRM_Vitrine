-- ============================================================
-- 030_aba_ai_openrouter_e_aceite.sql — provedor novo + prova de ciência
-- (complemento da Subetapa 02.11, decisão de Max em 2026-08-19)
--
-- DUAS COISAS, PELO MESMO MOTIVO
--
-- (1) `openrouter` entra como terceiro provedor. Confirmado na
--     documentação vigente (search-first, CLAUDE.md §11): a API é
--     compatível com o formato *chat completions* da OpenAI
--     (`https://openrouter.ai/api/v1/chat/completions`,
--     `Authorization: Bearer`), e o plano gratuito dá 50 requisições/dia
--     sem crédito e 1000/dia com US$10 em crédito, com teto de 20/min.
--
-- (2) O aceite do termo de tratamento de dados vira **registro**, não só
--     texto na tela. E é justamente por causa do provedor novo que isso
--     ficou mais necessário: no roteamento gratuito do OpenRouter a
--     política de dados **é de cada provedor**, não da plataforma, e
--     existe configuração separada para "permitir roteamento a
--     provedores que podem treinar com seus dados". Quem conecta uma
--     chave nessas condições precisa ter sido informado, e o produto
--     precisa ser capaz de mostrar que informou.
--
-- POR QUE UMA TABELA, E NÃO UMA COLUNA EM `ia_configuracoes`
--
-- Porque o aceite tem de existir **antes** de existir configuração — ele
-- é a porta que dá acesso ao formulário de credenciais. Uma coluna na
-- configuração só poderia ser preenchida depois de a chave já ter sido
-- colada, que é tarde demais para servir de prova de ciência prévia.
--
-- POR QUE VERSIONADO
--
-- `versao_termo` guarda **qual texto** foi aceito. Sem isso, mudar o
-- termo depois deixaria aceites antigos valendo para um texto que a
-- pessoa nunca leu — que é exatamente o vício que um registro de aceite
-- existe para não ter. Texto novo, versão nova, aceite novo.
--
-- SEM UPDATE E SEM DELETE, para ninguém — aceite é prova, e prova que se
-- reescreve não é prova. Mesmo raciocínio de `aba_health.log_acesso`
-- (migration 013) e `aba_automations.automacao_logs` (017).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. `openrouter` como provedor aceito
-- ------------------------------------------------------------
ALTER TABLE aba_ai.ia_configuracoes DROP CONSTRAINT IF EXISTS ia_configuracoes_provedor_check;
ALTER TABLE aba_ai.ia_configuracoes ADD CONSTRAINT ia_configuracoes_provedor_check
  CHECK (provedor IN ('openai', 'anthropic', 'openrouter'));

ALTER TABLE aba_ai.ia_log_uso DROP CONSTRAINT IF EXISTS ia_log_uso_provedor_check;
ALTER TABLE aba_ai.ia_log_uso ADD CONSTRAINT ia_log_uso_provedor_check
  CHECK (provedor IN ('openai', 'anthropic', 'openrouter'));

-- ------------------------------------------------------------
-- 2. Registro de aceite do termo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aba_ai.aceites_termo_ia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- Quem aceitou, nominalmente. RESTRICT e não CASCADE: remover o
  -- usuário da conta não pode apagar o registro de que ele aceitou —
  -- é o mesmo motivo pelo qual log_acesso usa RESTRICT no ator.
  usuario_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  versao_termo  TEXT NOT NULL,
  aceito_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um aceite por usuário por versão. Reaceitar a mesma versão é
-- idempotente (ON CONFLICT DO NOTHING no lado da aplicação); versão
-- nova gera linha nova, preservando o histórico de qual texto cada
-- pessoa leu e quando.
CREATE UNIQUE INDEX IF NOT EXISTS idx_aceites_termo_ia_usuario_versao
  ON aba_ai.aceites_termo_ia(usuario_id, versao_termo);
CREATE INDEX IF NOT EXISTS idx_aceites_termo_ia_conta
  ON aba_ai.aceites_termo_ia(account_id, aceito_em DESC);

ALTER TABLE aba_ai.aceites_termo_ia ENABLE ROW LEVEL SECURITY;

-- Leitura por qualquer membro da conta: a tela precisa saber se JÁ
-- houve aceite antes de decidir se mostra o formulário de credenciais,
-- e quem administra precisa poder auditar quem aceitou o quê.
DROP POLICY IF EXISTS aceites_termo_ia_select ON aba_ai.aceites_termo_ia;
CREATE POLICY aceites_termo_ia_select ON aba_ai.aceites_termo_ia FOR SELECT
  USING (public.is_account_member(account_id, 'viewer'));

-- Escrita: só o PRÓPRIO usuário registra o próprio aceite
-- (`usuario_id = auth.uid()`). Ninguém aceita em nome de outro — um
-- aceite que um terceiro pudesse inserir não provaria ciência de
-- ninguém. `admin` exigido porque conectar chave de IA já exige
-- `admin+`: quem não pode configurar não precisa aceitar.
DROP POLICY IF EXISTS aceites_termo_ia_insert ON aba_ai.aceites_termo_ia;
CREATE POLICY aceites_termo_ia_insert ON aba_ai.aceites_termo_ia FOR INSERT
  WITH CHECK (
    public.is_account_member(account_id, 'admin')
    AND usuario_id = auth.uid()
  );

-- Sem policy de UPDATE nem DELETE, para ninguém (ver cabeçalho).

GRANT SELECT, INSERT ON aba_ai.aceites_termo_ia TO authenticated;
GRANT ALL ON aba_ai.aceites_termo_ia TO service_role;

COMMENT ON TABLE aba_ai.aceites_termo_ia IS
  'Prova de ciência do termo de tratamento de dados por provedor externo de IA. Versionado: texto novo exige aceite novo. Sem UPDATE/DELETE — aceite que se reescreve não é prova.';
