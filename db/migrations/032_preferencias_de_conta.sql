-- ============================================================
-- 032_preferencias_de_conta.sql — aparência por conta (Subetapa 02.12)
--
-- A tela `1m` do wireframe ratificado tem um card "Aparência e layout"
-- com cinco controles: template de layout, tema (claro/escuro/sistema),
-- densidade (compacto/espaçoso), cor de destaque e tipografia. Até aqui
-- **não havia onde gravar nenhum deles**: `public.accounts` tem só
-- `id, name, owner_user_id, created_at, updated_at`, e não existe tabela
-- de preferência em lugar nenhum do banco.
--
-- `docs/04_DESIGN_E_MARCA.md` §4 é explícito quanto ao destino: tema, cor
-- de destaque e layout são "variável de conta, não hardcoded em
-- componente", "resolvida em tempo de carregamento — não exige rebuild
-- por cliente". Esta migration é esse lugar.
--
-- DECISÃO DE ESCOPO, DE MAX (2026-08-19)
--
-- "Identidade visual por conta (`branding`)" consta do backlog de
-- versionamento como item `+1.0`. Criar esta tabela agora **antecipa
-- parte desse item para dentro do MVP** — decisão consciente de Max,
-- tomada depois de a alternativa (renderizar os controles desabilitados,
-- como o seletor de templates) ter sido apresentada. Fica registrado
-- para que a sessão seguinte não leia isto como escopo que vazou.
--
-- O que NÃO entra junto: **upload de logomarca**. O wireframe desenha um
-- campo de logo, mas ele exige bucket de Storage por conta com políticas
-- próprias — é o resto do item `branding`, não um campo a mais. O
-- controle aparece na tela desabilitado, com o motivo escrito.
--
-- POR QUE O NOME DA TABELA E DAS COLUNAS ESTÁ EM INGLÊS
--
-- `CLAUDE.md` §2 manda snake_case em português/BR **dentro de cada
-- schema de módulo** (`aba_*`), e proíbe misturar as duas convenções no
-- mesmo schema. `public`, `access`, `licensing` e `analytics` são
-- infraestrutura de plataforma e estão inteiramente em inglês. Uma
-- tabela em português dentro de `public` seria exatamente a mistura que
-- a regra proíbe — em inglês ela fica coerente com as sete vizinhas.
--
-- POR QUE `layout_template` SÓ ACEITA UM VALOR
--
-- `docs/00_PLANO_E_CRITERIOS.md` (Qualidade da 02.12) autoriza o v01 a
-- entregar "um único template ativo com os demais desabilitados", já que
-- múltiplos templates é item `+1.0` do backlog e não pré-requisito de
-- lançamento (`docs/04` §4). Aqui esse "desabilitado" é **garantia de
-- banco**, não promessa de UI: o CHECK aceita só `'fixed_sidebar'`.
--
-- É o mesmo padrão do CHECK que trava `pode_ler_prontuario` na migration
-- 028, e pelo mesmo motivo: um seletor cujas outras três opções são
-- apenas `disabled` no HTML depende de o HTML continuar certo. Com o
-- CHECK, ligar um template novo deixa de ser um clique e passa a exigir
-- migration deliberada — que é quando o template de fato existir. Se
-- alguém tentar por API, o banco responde 23514.
--
-- ONDE ISSO É APLICADO
--
-- `crm/src/lib/preferencias.tsx` lê esta linha uma vez por sessão e
-- escreve `class="dark"`, `data-density`, `data-accent` e
-- `data-typography` no `<html>`; `crm/src/index.css` traz as variantes.
-- Nenhum hex sai do `index.css` (docs/04 §4).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_preferences (
  account_id      UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- 'system' segue o prefers-color-scheme do dispositivo de quem olha.
  theme           TEXT NOT NULL DEFAULT 'light'
                    CHECK (theme IN ('light', 'dark', 'system')),

  -- Compacto/espaçoso do wireframe. Aplicado como escala tipográfica na
  -- raiz — o espaçamento do Tailwind é em rem, então a grade inteira
  -- acompanha sem precisar de classe condicional espalhada por tela.
  density         TEXT NOT NULL DEFAULT 'comfortable'
                    CHECK (density IN ('compact', 'comfortable')),

  -- Os cinco swatches desenhados no card "Cor de destaque" da tela `1m`,
  -- que são as cores semânticas já ratificadas em docs/04 §5.2:
  -- #5b87a8 azul clínico · #8fb4a6 sage · #c8b79a tan · #9c8fa8 lilás
  -- · #a8827a terracota. O sexto quadrado do wireframe (tracejado, "cor
  -- livre") não entra: cor arbitrária escolhida por cliente quebra o
  -- contraste de texto sobre tint, que a paleta ratificada garante par
  -- a par. Cor livre exige validação de contraste — trabalho próprio.
  accent          TEXT NOT NULL DEFAULT 'clinical_blue'
                    CHECK (accent IN ('clinical_blue', 'sage', 'tan', 'lilac', 'terracotta')),

  -- "Sans neutra" / "Serifa editorial" do wireframe.
  typography      TEXT NOT NULL DEFAULT 'sans'
                    CHECK (typography IN ('sans', 'serif')),

  -- Ver cabeçalho: valor único é a trava do template do v01.
  layout_template TEXT NOT NULL DEFAULT 'fixed_sidebar'
                    CHECK (layout_template IN ('fixed_sidebar')),

  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.account_preferences IS
  'Aparência por conta (Subetapa 02.12). Uma linha por conta, criada pelo trigger de public.accounts.';
COMMENT ON COLUMN public.account_preferences.layout_template IS
  'CHECK de valor único: o v01 tem um template só (docs/00, Qualidade da 02.12). Liberar outro exige migration.';

-- ------------------------------------------------------------
-- RLS — leitura para qualquer membro, escrita a partir de admin.
--
-- Aparência é configuração de conta, não privilégio: todo membro precisa
-- LER (é o tema que a tela dele vai vestir), e só admin+ decide. Sem
-- policy de DELETE: a linha morre junto com a conta, pelo CASCADE, e
-- apagá-la à mão só produziria conta sem preferência.
-- ------------------------------------------------------------
ALTER TABLE public.account_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_preferences_select ON public.account_preferences;
CREATE POLICY account_preferences_select ON public.account_preferences
  FOR SELECT USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS account_preferences_insert ON public.account_preferences;
CREATE POLICY account_preferences_insert ON public.account_preferences
  FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS account_preferences_update ON public.account_preferences;
CREATE POLICY account_preferences_update ON public.account_preferences
  FOR UPDATE USING (public.is_account_member(account_id, 'admin'))
              WITH CHECK (public.is_account_member(account_id, 'admin'));

-- ------------------------------------------------------------
-- GRANT estreito.
--
-- `ALTER DEFAULT PRIVILEGES` da migration 006 já deixa tabela nova em
-- `public` nascer estreita, mas o privilégio de fábrica deste projeto
-- Supabase entrega ALL a anon/authenticated em tabela nova de `public`
-- (handoffs/instrucoes.md §5) e default privilege depende de quem
-- executa o CREATE. Repetido aqui à mão: barato, e não depende de
-- inferência sobre o papel que rodou a migration.
-- ------------------------------------------------------------
REVOKE ALL ON public.account_preferences FROM anon;
REVOKE ALL ON public.account_preferences FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_preferences TO authenticated;
GRANT ALL ON public.account_preferences TO service_role;

-- ------------------------------------------------------------
-- updated_at
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.account_preferences;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Toda conta nasce com uma linha.
--
-- Sem isto, a UI precisaria tratar "conta sem preferência" como caso
-- especial em todo carregamento, e um INSERT feito pelo client exigiria
-- admin — ou seja, um `viewer` entrando primeiro numa conta nova ficaria
-- sem tema. O trigger roda como SECURITY DEFINER porque a linha nasce no
-- mesmo instante da conta, antes de existir qualquer membro para
-- satisfazer a policy de INSERT.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_preferencias_da_conta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.account_preferences (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_preferencias_da_conta() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_preferencias_da_conta() FROM anon;
REVOKE ALL ON FUNCTION public.criar_preferencias_da_conta() FROM authenticated;

DROP TRIGGER IF EXISTS criar_preferencias_da_conta ON public.accounts;
CREATE TRIGGER criar_preferencias_da_conta
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.criar_preferencias_da_conta();

-- Conta que já existia antes desta migration.
INSERT INTO public.account_preferences (account_id)
SELECT a.id FROM public.accounts a
ON CONFLICT (account_id) DO NOTHING;
