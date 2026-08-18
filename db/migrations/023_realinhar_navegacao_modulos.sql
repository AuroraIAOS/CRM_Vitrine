-- ============================================================
-- 023_realinhar_navegacao_modulos.sql
--
-- Subetapa 02.1 — realinha access.modules.position à ordem de navegação
-- ratificada no pacote de wireframes (Etapa de Transição 1→2,
-- design/wireframes-crm-sa-de-e-est-tica/project/Shell.dc.html), decisão
-- registrada em docs/01_ARQUITETURA.md §7.1: a ordem do wireframe é a
-- fonte de verdade da navegação, já que 003_core_access.sql aplicou a
-- ordem original do CRM Maximus (catalog/scheduling antes de sales).
--
-- UPDATE puro, sem DDL — nenhuma coluna/tabela nova. Sem risco de colisão:
-- access.modules não tem UNIQUE(position) (só UNIQUE(key) e PK(id)).
-- ============================================================

UPDATE access.modules SET position = 1 WHERE key = 'people';
UPDATE access.modules SET position = 2 WHERE key = 'scheduling';
UPDATE access.modules SET position = 3 WHERE key = 'sales';
UPDATE access.modules SET position = 4 WHERE key = 'finance';
UPDATE access.modules SET position = 5 WHERE key = 'health';
UPDATE access.modules SET position = 6 WHERE key = 'catalog';
UPDATE access.modules SET position = 7 WHERE key = 'messaging';
UPDATE access.modules SET position = 8 WHERE key = 'automations';
UPDATE access.modules SET position = 9 WHERE key = 'ai';
UPDATE access.modules SET position = 10 WHERE key = 'settings';
