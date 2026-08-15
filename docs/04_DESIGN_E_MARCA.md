# 04_DESIGN_E_MARCA — CRM Vitrine

## 1. Sistema base: herdado do Maximus

O CRM Maximus já tem um sistema funcional de modo Light/Dark + cor de destaque configurável. Reaproveitar integralmente: tokens de cor (CSS variables), toggle de tema, persistência de preferência por usuário. Não redesenhar do zero — é peça pronta e testada.

## 2. O que muda: layout configurável por CRM-filho

O objetivo do CRM Vitrine não é ter uma única cara, é ter **múltiplos templates de layout** que um clone pode escolher:

- Distribuição de sidebar (esquerda fixa, colapsável, top-nav).
- Densidade de grade/containers de conteúdo (compacto vs. espaçoso).
- Paleta de destaque por cliente (herdada do sistema Light/Dark do Maximus, estendida a mais de uma cor de marca).
- Tipografia e logomarca por cliente.

## 3. `design/` — o que vive aqui

Arquivos-fonte de marca: paletas, tipografias, logos, guias de identidade visual. Max aloca aqui referências e explorações de múltiplos templates de configuração à medida que forem surgindo — este documento descreve as diretrizes gerais; `design/` guarda os arquivos.

## 4. Regras de aplicação

- Tema (light/dark) e cor de destaque: variável de conta, não hardcoded em componente.
- Layout (sidebar/grid): variável de conta, resolvida em tempo de carregamento — não exige rebuild por cliente.
- Logomarca: upload via Storage do Supabase, referenciada por conta.
- Nenhuma decisão de design aqui bloqueia o MVP — o v01 pode nascer com um único template padrão; a seleção de múltiplos templates é evolução natural (`+1.0`), não pré-requisito de lançamento.
