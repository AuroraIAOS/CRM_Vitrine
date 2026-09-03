-- ============================================================
-- 041_relatorio_acoes_usuarios.sql — Subetapa 03.5, item 8
--
-- Objetivo: "relatório 'Ações dos usuários' sobre aba_health.log_acesso,
-- visível apenas ao owner". A política de SELECT que a migration 013
-- criou para `log_acesso` era `is_account_member(account_id, 'admin')`
-- — herdada do mesmo padrão de `licensing.limit_changes`, correta para
-- uma trilha técnica genérica, mas errada para ESTE relatório
-- especificamente: "Ações dos usuários" é vigilância de equipe sobre
-- dado clínico, e a decisão do produto (Objetivo da 03.5) é que só o
-- dono da conta enxerga quem acessou o quê — nem `admin` vê a atividade
-- dos colegas.
--
-- Item 6 (consentimento de imagem travando publicação) NÃO entra nesta
-- migration — confirmado por leitura direta do repositório antes de
-- escrever qualquer coisa (CLAUDE.md §11) que já está construído desde
-- a Subetapa 02.9: `crm/src/features/health/ConsentimentosTab.tsx`
-- (tela, wired em `ProntuarioPage.tsx`) e a trava real em
-- `014_aba_health_attachments_bucket.sql` (`pode_acessar_anexo()`
-- recusa leitura de imagem sem `consentimento_vigente(..., 'uso_imagem')`
-- vigente, decisão de Max de 2026-08-08 registrada em
-- `docs/00_PLANO_E_CRITERIOS.md` → Pendências vigiadas). O Objetivo da
-- 03.5 estava desatualizado nesse ponto — mesma classe de achado que a
-- 03.0 já corrigiu para o odontograma e o enum de falta. Registrado no
-- Status da subetapa, não silenciado.
--
-- Sem tabela nova: `log_acesso` não tem narrowing por coluna (ao
-- contrário de prontuarios/evolucoes/respostas_anamnese/consentimentos
-- — é infraestrutura de auditoria, não dado clínico, ver cabeçalho da
-- 013), então uma vez que a RLS deixa a linha passar, todas as colunas
-- são legíveis — o relatório é `SELECT` direto do client, agregado em
-- JS, mesmo padrão de `useAuditoria()` (`crm/src/features/settings/
-- api.ts`).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

DROP POLICY IF EXISTS log_acesso_select ON aba_health.log_acesso;
CREATE POLICY log_acesso_select ON aba_health.log_acesso FOR SELECT
  USING (public.is_account_member(account_id, 'owner'));

-- INSERT segue como estava (013): qualquer membro grava a própria
-- linha, e só as funções SECURITY DEFINER (ler_*(), gatilho de escrita)
-- de fato inserem — a aplicação nunca insere aqui direto.
