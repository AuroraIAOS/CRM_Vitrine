import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useDadosDaConta, useSalvarNomeDaConta } from "../api";
import { CardSecao, LinhaDado, Nota, Rotulo, TituloSecao, Vazio } from "./ui";

/**
 * Seção "Dados da conta" da tela `1m`.
 *
 * **`accounts.owner_user_id` não tem formulário aqui, e não é esquecimento.**
 * A Qualidade declarada da Subetapa 02.12 é explícita: a transferência de
 * titularidade só acontece pela RPC da Subetapa 02.2. A trava real é o
 * trigger `enforce_account_privilege_columns` (correção A02 do portão
 * adversarial da 01.8) — ele recusa a mudança da coluna venha ela de onde
 * vier, inclusive de um `UPDATE` direto pela API. Esta tela apenas **exibe**
 * o titular e diz onde a troca acontece.
 */
export function DadosDaConta() {
  const { profile } = useAuth();
  const { data, isPending } = useDadosDaConta();
  const salvar = useSalvarNomeDaConta();
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (data) setNome(data.nome);
  }, [data?.nome]);

  const podeEditar = profile?.accountRole === "owner" || profile?.accountRole === "admin";
  const mudou = !!data && nome.trim() !== data.nome && nome.trim().length > 0;

  if (isPending || !data) return <Vazio>Carregando dados da conta…</Vazio>;

  return (
    <div className="flex flex-col gap-3">
      <CardSecao>
        <TituloSecao titulo="Identificação" descricao="O nome que aparece para a equipe desta conta." />
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mudou) salvar.mutate(nome.trim());
          }}
        >
          <Rotulo>Nome da conta</Rotulo>
          <div className="flex gap-2">
            <input
              value={nome}
              disabled={!podeEditar}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 rounded-[5px] border border-input bg-background px-2.5 py-1.5 text-[11.5px] text-foreground outline-none focus:border-primary disabled:opacity-50"
            />
            <Button type="submit" size="sm" disabled={!podeEditar || !mudou || salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
          {salvar.isError && (
            <span className="text-[10.5px] text-destructive-tint-foreground">{(salvar.error as Error).message}</span>
          )}
          {salvar.isSuccess && !mudou && (
            <span className="text-[10.5px] text-success-tint-foreground">Nome atualizado.</span>
          )}
        </form>

        <div className="flex flex-col">
          <LinhaDado rotulo="Identificador da conta">
            <code className="font-mono text-[10px]">{data.id}</code>
          </LinhaDado>
          <LinhaDado rotulo="Criada em">
            {new Date(data.criadaEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </LinhaDado>
        </div>
      </CardSecao>

      <CardSecao>
        <TituloSecao titulo="Titularidade" descricao="Quem responde pela conta." />
        <div className="flex flex-col">
          <LinhaDado rotulo="Proprietário(a)">
            {data.titularNome || data.titularEmail || <span className="text-muted-foreground">não identificado</span>}
          </LinhaDado>
          {data.titularEmail && data.titularNome && <LinhaDado rotulo="E-mail">{data.titularEmail}</LinhaDado>}
        </div>
        <Nota>
          A titularidade <strong>não se edita por formulário</strong>, aqui nem em nenhuma outra tela. Ela só muda pela
          rotina de transferência criada na Subetapa 02.2, e a recusa não depende desta interface: o trigger{" "}
          <code>enforce_account_privilege_columns</code> rejeita a alteração de <code>owner_user_id</code> mesmo vinda
          direto pela API. É a trava do achado A02 do portão de segurança adversarial.
        </Nota>
      </CardSecao>
    </div>
  );
}
