# Índice — referências visuais extraídas dos vídeos

**13 mosaicos** dos vídeos que a triagem elegeu como mais ricos em tela de produto, gerados em
**2026-09-01** por [`../../frames_video.mjs`](../../frames_video.mjs).

Cada arquivo é um mosaico de 12 quadros a **1024 px por quadro** (3 colunas × 4 linhas,
3072×~1728 px) — a resolução em que se consegue **ler o texto da interface**. A triagem completa
dos 56 vídeos públicos está em [`../../fontes/VIDEOS.md`](../../fontes/VIDEOS.md).

**Regra aplicada:** um arquivo por vídeo, e cada arquivo sustenta **uma tese declarada**. Quadro
que não sustenta afirmação nenhuma não foi arquivado.

Material de terceiro, coletado de vídeo público do YouTube para benchmark interno. Nenhuma marca
aqui é reaproveitada como identidade do Vitrine, nem republicada fora deste repositório.

| Arquivo | Vídeo | A tese que sustenta | URL |
|---|---|---|---|
| `SD02_simplesdental.jpg` | Painel de tarefas para a secretária | **O painel do líder é uma lista de tarefas acionáveis, não de gráficos** — e valida a Versão 03 do nosso dossiê de UX | https://www.youtube.com/watch?v=6oLghuuRANs |
| `SD03_simplesdental.jpg` | Como cadastrar sua equipe | Permissão por **concessão pura** agrupada por módulo, com papel-preset e contador "31 de 31" — o mesmo desenho do nosso `access.can()` | https://www.youtube.com/watch?v=KJFV3CiXTH0 |
| `SD06_simplesdental.jpg` | Como imprimir um orçamento | **O modelo de orçamento inteiro**: linha com plano, procedimento, dente e faces; alternâncias de impressão; PDF com duas assinaturas | https://www.youtube.com/watch?v=x7I-CnQxabw |
| `SD12_simplesdental.jpg` | Como adicionar um novo plano | Catálogo com **preço por convênio**, herança do plano padrão e a caixa **"aceita faces"** — o elo que liga catálogo e odontograma | https://www.youtube.com/watch?v=pBqKWkNeKFU |
| `SD15_simplesdental.jpg` | Como emitir uma anamnese | **Alertas clínicos derivados da anamnese**, fixos no cabeçalho da ficha ("Hipertenso", "Risco de hemorragia") — segurança do paciente | https://www.youtube.com/watch?v=1NwNj_tF5Hw |
| `CF04_clinicorp.jpg` | Agendamento online | O agendamento público entra como **solicitação a confirmar**, não direto na agenda; entrada pelo link da bio do Instagram | https://www.youtube.com/watch?v=KxNtKvFeuPI |
| `CF05_clinicorp.jpg` | Ficha TBA (toxina botulínica) | **Faceograma 2D**: pontos sobre a foto do paciente, pares antes/depois por região e rastreio de lote e validade — o mercado não usa 3D | https://www.youtube.com/watch?v=kEeEwYL3ILU |
| `CF06_clinicorp.jpg` | Odontograma digital | Dentição **permanente / decídua / mista**, três estados por cor e **comparação entre datas**; periograma ao lado | https://www.youtube.com/watch?v=qZiAfxzW0ic |
| `CF07_clinicorp.jpg` | Régua de cobrança | **A melhor peça de UX do corpus**: a configuração de cobrança como linha do tempo, cada ponto pendurando uma regra | https://www.youtube.com/watch?v=efAtV6vD2Og |
| `CF18_clinicorp.jpg` | Controle protético | Prótese como **kanban de cinco etapas** com cor de atraso — reusa o componente que já temos para o funil | https://www.youtube.com/watch?v=bS4cF9m6Dok |
| `CT04_clinicorp.jpg` | Listar ações dos usuários | **O log de auditoria exposto como relatório ao cliente** — nós gravamos mais e não mostramos nada | https://www.youtube.com/watch?v=-FgRj4lPDLg |
| `CT07_clinicorp.jpg` | Clinicorp IA na prática | IA em três usos, e o padrão ético: **a IA propõe, o humano confirma antes de aplicar** | https://www.youtube.com/watch?v=dsSOiO-kSZU |
| `CT09_clinicorp.jpg` | Orçamento rápido | **Aprovar o orçamento gera o lançamento financeiro** — a corrente catálogo→odontograma→orçamento→financeiro, fechada | https://www.youtube.com/watch?v=4HM8U3MQAzc |

## Como refazer

```bash
source ~/.claude/jobs/bench-odonto/env.sh     # PATH de python/ffmpeg/yt-dlp/deno + SKILL_DIR
node design/benchmark/assistir.mjs            # passada 1 — os 56 vídeos, triagem
node design/benchmark/frames_video.mjs        # passada 2 — estes 13 mosaicos
```
