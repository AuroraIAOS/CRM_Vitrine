/**
 * Declaração local de `pg`, só para a suíte de RLS (Subetapa 03.8.a).
 *
 * POR QUE ELA EXISTE. `20_orcamento.spec.ts` precisa de UMA conexão de
 * dono do banco na limpeza de fixture — porque os gatilhos de
 * imutabilidade da migration `048` recusam apagar tarifa comprometida até
 * para o `service_role`, que é justamente a prova de que a trava não tem
 * atalho pela aplicação. Todos os outros consumidores de `pg` neste
 * repositório são `.mjs` (`scripts/`), e por isso o projeto nunca precisou
 * de `@types/pg`.
 *
 * ESCOLHA DECLARADA: acrescentar `@types/pg` ao `package.json` mudaria o
 * lock por causa de uma conexão de limpeza, e `CLAUDE.md` §15 pede
 * parcimônia com dependência nova. Estas linhas descrevem exatamente o que
 * a suíte usa — nada mais. Se um dia `@types/pg` entrar por outro motivo,
 * este arquivo sai.
 */
declare module "pg" {
  export class Client {
    constructor(config: { connectionString?: string; ssl?: { rejectUnauthorized: boolean } });
    connect(): Promise<void>;
    query<T = Record<string, unknown>>(texto: string, valores?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
  const pg: { Client: typeof Client };
  export default pg;
}
