-- ============================================================
-- 014_aba_health_attachments_bucket.sql — bucket privado de anexo
-- clínico
--
-- Origem: Maximus 069_health_attachments_bucket.sql. Bucket 'anexos-
-- clinicos' (nome em português — greenfield, sem precedente de bucket
-- herdado do núcleo neste projeto ainda).
--
-- Os buckets do núcleo (quando existirem, ex.: avatars) tendem a ser
-- PÚBLICOS por desenho — provedor externo busca a URL sem autenticação
-- para enviar mídia. Foto de antes e depois não pode viver sob esse
-- regime: docs/05_COMPLIANCE_E_ETICA.md §1 trata dado clínico como a
-- peça de maior risco jurídico do produto — bucket público e link
-- permanente/adivinhável está fora de cogitação.
--
-- Este bucket é privado. Em bucket privado TODA operação, inclusive o
-- download, passa pela RLS de storage.objects; o único caminho de
-- leitura é `download` com o JWT do usuário ou `createSignedUrl`, que
-- exige SELECT no momento em que a URL é assinada. Fonte (search-first,
-- CLAUDE.md §11): https://supabase.com/docs/guides/storage/buckets/fundamentals
-- e .../storage/security/access-control.
--
-- A POLÍTICA NÃO É "MEMBRO DA CONTA" — repetir esse padrão abriria foto
-- clínica para a recepção. Aqui a decisão é de
-- aba_health.pode_acessar(cliente_id, ação), a mesma função que governa
-- as tabelas — o caminho do objeto carrega o cliente, e é ele que
-- decide.
--
-- Convenção de caminho (obrigatória, e a política depende dela):
--   anexos-clinicos/conta-<account_id>/cliente-<cliente_id>/<ts>-<nome>.<ext>
--
-- FALHA FECHADA — caminho que não casar com a convenção devolve NULL
-- no cliente e a autorização devolve FALSE antes de qualquer outra
-- checagem. Importa mais do que parece:
-- aba_health.pode_acessar(NULL, 'leitura') devolve TRUE para o owner
-- (passo 2 é atalho de papel), então deixar o id sair como NULL abriria
-- todo caminho malformado ao proprietário — mesma lição de
-- access.can() fail-closed (003_core_access.sql).
--
-- Sem política de UPDATE nem de DELETE: anexo de prontuário não se
-- sobrescreve nem se apaga pela aplicação, mesmo motivo de evolução
-- travada não aceitar alteração.
--
-- Consentimento de imagem trava só a LEITURA, nunca o envio — decisão
-- de Max já registrada em docs/00_PLANO_E_CRITERIOS.md, "Pendências
-- vigiadas": travar o envio apagaria o registro do atendimento em vez
-- de proteger a imagem, e a decisão de manter assim (mesmo travando
-- para quem tirou a foto) foi confirmada por Max em 2026-08-08.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. aba_health.cliente_do_anexo — o cliente dono do arquivo
-- ------------------------------------------------------------
-- Puro e IMMUTABLE: só interpreta a string do caminho. Devolve NULL
-- para tudo que não seja exatamente a convenção acima — nunca "chuta"
-- um id.
CREATE OR REPLACE FUNCTION aba_health.cliente_do_anexo(p_nome_objeto TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_partes TEXT[];
BEGIN
  IF p_nome_objeto IS NULL THEN
    RETURN NULL;
  END IF;

  v_partes := string_to_array(p_nome_objeto, '/');

  -- Exatamente três segmentos: conta, cliente e arquivo. Um arquivo
  -- solto na raiz, ou uma pasta a mais, não é caminho válido deste
  -- bucket.
  IF array_length(v_partes, 1) IS DISTINCT FROM 3 THEN
    RETURN NULL;
  END IF;

  IF v_partes[2] !~* '^cliente-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN substring(v_partes[2] FROM 9)::UUID;
END;
$$;

ALTER FUNCTION aba_health.cliente_do_anexo(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.cliente_do_anexo(TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 2. aba_health.consentimento_vigente — consentimento vigente de um
-- tipo
-- ------------------------------------------------------------
-- "Foto de antes e depois só é exibida se houver consentimento de
-- imagem vigente". A regra vive aqui, não na tela: tela é o lugar de
-- explicar o bloqueio, nunca de ser o bloqueio.
--
-- Vigente = o consentimento mais recente daquele tipo tem concedido e
-- não foi revogado. Um uso_imagem revogado depois de concedido volta a
-- fechar a foto, e é por isso que a checagem olha a linha mais recente
-- em vez de "existe alguma concedida".
--
-- Sem EXECUTE para authenticated de propósito: quem chama é a função
-- de autorização do bucket (SECURITY DEFINER, roda como postgres). A
-- tela deriva o mesmo estado da lista que
-- aba_health.ler_consentimentos() devolve — e essa leitura fica
-- logada, como toda leitura clínica.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION aba_health.consentimento_vigente(
  p_cliente_id UUID,
  p_tipo TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_concedido BOOLEAN;
  v_revogado TIMESTAMPTZ;
BEGIN
  IF p_cliente_id IS NULL
     OR p_tipo IS NULL
     OR p_tipo NOT IN ('tratamento_dados', 'procedimento', 'uso_imagem') THEN
    RETURN FALSE;
  END IF;

  SELECT c.concedido, c.revogado_em
  INTO v_concedido, v_revogado
  FROM aba_health.consentimentos c
  WHERE c.cliente_id = p_cliente_id
    AND c.tipo = p_tipo
  ORDER BY COALESCE(c.concedido_em, c.criado_em) DESC, c.criado_em DESC
  LIMIT 1;

  RETURN COALESCE(v_concedido, FALSE) AND v_revogado IS NULL;
END;
$$;

ALTER FUNCTION aba_health.consentimento_vigente(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.consentimento_vigente(UUID, TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 3. aba_health.pode_acessar_anexo — a decisão do bucket
-- ------------------------------------------------------------
-- Ordem: convenção de caminho → conta do caminho bate com a conta do
-- cliente → pode_acessar() → consentimento de imagem quando o arquivo
-- é imagem e a ação é leitura.
CREATE OR REPLACE FUNCTION aba_health.pode_acessar_anexo(
  p_nome_objeto TEXT,
  p_acao TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente_id UUID;
  v_account_id UUID;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN ('leitura', 'criacao') THEN
    RETURN FALSE;
  END IF;

  v_cliente_id := aba_health.cliente_do_anexo(p_nome_objeto);
  IF v_cliente_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- O primeiro segmento tem que ser a conta REAL do cliente, não uma
  -- conta qualquer digitada por quem monta o caminho. Sem isto o
  -- segmento "conta-..." seria decorativo, e caminho decorativo dentro
  -- de uma política de segurança é convite a confiar nele algum dia.
  SELECT c.account_id INTO v_account_id
  FROM aba_people.clientes c
  WHERE c.id = v_cliente_id;

  IF v_account_id IS NULL
     OR (string_to_array(p_nome_objeto, '/'))[1] <> ('conta-' || v_account_id::TEXT) THEN
    RETURN FALSE;
  END IF;

  IF NOT aba_health.pode_acessar(v_cliente_id, p_acao) THEN
    RETURN FALSE;
  END IF;

  IF p_acao = 'leitura'
     AND p_nome_objeto ~* '\.(png|jpe?g|webp)$'
     AND NOT aba_health.consentimento_vigente(v_cliente_id, 'uso_imagem') THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION aba_health.pode_acessar_anexo(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION aba_health.pode_acessar_anexo(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aba_health.pode_acessar_anexo(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. O bucket
-- ------------------------------------------------------------
-- public = FALSE é a diferença que importa. Lista de tipos estreita:
-- imagem de antes e depois e documento em PDF (laudo, termo assinado).
-- 10 MB — foto de celular cabe com folga e o teto desencoraja despejar
-- vídeo de procedimento aqui, que teria regime de guarda próprio.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos-clinicos',
  'anexos-clinicos',
  FALSE,
  10485760, -- 10 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- 5. RLS de storage.objects, só para este bucket
-- ------------------------------------------------------------
-- Filtrada por bucket_id — não alcança nenhum outro bucket que venha a
-- existir. Política permissiva é OR-ada com as demais; conferir contra
-- o catálogo de políticas de storage.objects antes de adicionar um
-- bucket novo continua sendo obrigatório (registrado em
-- handoffs/instrucoes.md).
DROP POLICY IF EXISTS "Anexo clinico so sai por autorizacao clinica" ON storage.objects;
CREATE POLICY "Anexo clinico so sai por autorizacao clinica"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'anexos-clinicos'
    AND aba_health.pode_acessar_anexo(name, 'leitura')
  );

DROP POLICY IF EXISTS "Anexo clinico so entra por autorizacao clinica" ON storage.objects;
CREATE POLICY "Anexo clinico so entra por autorizacao clinica"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'anexos-clinicos'
    AND aba_health.pode_acessar_anexo(name, 'criacao')
  );
