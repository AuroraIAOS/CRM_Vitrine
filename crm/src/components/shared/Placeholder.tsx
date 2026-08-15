import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Tela ainda não implementada — troca por página real na subetapa correspondente. */
export function Placeholder({ titulo }: { titulo: string }) {
  return (
    <Card className="m-6">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Módulo ainda não implementado.
      </CardContent>
    </Card>
  );
}
