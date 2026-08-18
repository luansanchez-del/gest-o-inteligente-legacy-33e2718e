import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { BrainCircuit, FileUp, Save, ShieldCheck, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta } from "@/components/common/EstadoConsulta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  analisarCurriculoBpo,
  listarCarteiraInteligente,
  salvarPerfilBpo,
} from "@/lib/api/carteira-inteligente.functions";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/curriculos-bpo")({
  component: CurriculosBpoPage,
  head: () => ({
    meta: [
      { title: "Currículos BPO | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Leitura profissional de currículos para apoiar a distribuição gerencial da Carteira Inteligente.",
      },
    ],
  }),
});

type Analise = {
  resumo: string;
  senioridade: string | null;
  regimes: string[];
  segmentos: string[];
  sistemas: string[];
  competencias: string[];
  observacoes: string[];
  textoProfissional: string;
  metodo: string;
};

function arquivoBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function CurriculosBpoPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [perfilId, setPerfilId] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [emailNovo, setEmailNovo] = useState("");

  const carteira = useQuery({
    queryKey: ["carteira-inteligente"],
    queryFn: () => listarCarteiraInteligente(),
  });

  const perfis = carteira.data?.perfis ?? [];
  const selecionado = useMemo(
    () => perfis.find((p) => p.id === perfilId) ?? null,
    [perfis, perfilId],
  );

  const analisar = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error("Selecione um currículo.");
      if (arquivo.size > 8 * 1024 * 1024) throw new Error("O currículo excede 8 MB.");
      const base64 = await arquivoBase64(arquivo);
      return analisarCurriculoBpo({
        data: { nome: arquivo.name, mimeType: arquivo.type || null, base64 },
      });
    },
    onSuccess: (r) => {
      setAnalise(r);
      toast.success("Currículo lido. Revise as informações profissionais extraídas.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const salvar = useMutation({
    mutationFn: () => {
      if (!analise) throw new Error("Analise um currículo primeiro.");
      const nome = selecionado?.nome ?? nomeNovo.trim();
      if (!nome) throw new Error("Selecione um BPO ou informe o nome do profissional.");
      return salvarPerfilBpo({
        data: {
          pierUserExternalId: selecionado?.pierUserExternalId ?? null,
          nome,
          email: (selecionado?.email ?? emailNovo.trim()) || null,
          senioridade: analise.senioridade,
          capacidade: selecionado?.capacidade ?? 60,
          regimes: analise.regimes,
          segmentos: analise.segmentos,
          sistemas: analise.sistemas,
          competencias: analise.competencias,
          curriculoTexto: analise.textoProfissional,
          resumoCurriculo: analise.resumo,
        },
      });
    },
    onSuccess: () => {
      toast.success("Análise profissional vinculada ao perfil BPO.");
      setArquivo(null);
      setAnalise(null);
      setPerfilId("");
      setNomeNovo("");
      setEmailNovo("");
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["carteira-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Análise Inteligente de Currículos BPO"
        descricao="Extrai somente experiência e competências profissionais para alimentar a Carteira Inteligente. A decisão sobre distribuição continua sendo do gestor."
      />

      <Card className="flex items-start gap-3 border-primary/25 bg-primary/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Critério profissional e auditável</p>
          <p className="mt-1 text-muted-foreground">
            Idade, gênero, estado civil, raça, religião, saúde, foto, endereço e outros dados pessoais/sensíveis são ignorados. O módulo não decide contratação nem “apto/inapto”; ele organiza experiência técnica para apoiar sua distribuição de carteira.
          </p>
        </div>
      </Card>

      {carteira.isError ? <ErroConsulta error={carteira.error} onRetry={() => void carteira.refetch()} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="space-y-5 p-5">
          <div>
            <p className="font-semibold">1. Selecionar currículo</p>
            <p className="mt-1 text-sm text-muted-foreground">PDF com texto, TXT, PNG, JPG ou WebP. Limite de 8 MB.</p>
          </div>
          <Input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setAnalise(null);
            }}
          />
          {arquivo ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{arquivo.name}</p>
              <p className="text-xs text-muted-foreground">{(arquivo.size / 1024).toFixed(0)} KB · {arquivo.type || "tipo não informado"}</p>
            </div>
          ) : null}
          <Button className="w-full" onClick={() => analisar.mutate()} disabled={!arquivo || analisar.isPending}>
            <BrainCircuit className="mr-2 h-4 w-4" />
            {analisar.isPending ? "Lendo currículo…" : "Analisar currículo"}
          </Button>

          <div className="border-t pt-5">
            <p className="font-semibold">2. Vincular ao profissional</p>
            <p className="mt-1 text-sm text-muted-foreground">Escolha alguém trazido do PIER ou cadastre um novo perfil.</p>
          </div>
          <div className="space-y-2">
            <Label>Perfil BPO existente</Label>
            <Select value={perfilId || "__NOVO__"} onValueChange={(v) => setPerfilId(v === "__NOVO__" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__NOVO__">Novo profissional</SelectItem>
                {perfis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!perfilId ? (
            <div className="grid gap-3">
              <div className="space-y-2"><Label>Nome</Label><Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} /></div>
              <div className="space-y-2"><Label>E-mail</Label><Input value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)} /></div>
            </div>
          ) : selecionado ? (
            <Card className="p-3">
              <div className="flex items-center gap-2"><UserRoundSearch className="h-4 w-4" /><p className="font-medium">{selecionado.nome}</p></div>
              <p className="mt-1 text-xs text-muted-foreground">{selecionado.email ?? "Sem e-mail"}</p>
            </Card>
          ) : null}
        </Card>

        <Card className="p-5">
          {!analise ? (
            <div className="flex min-h-96 flex-col items-center justify-center text-center text-muted-foreground">
              <FileUp className="h-10 w-10" />
              <p className="mt-3 font-medium text-foreground">A análise aparecerá aqui</p>
              <p className="mt-1 max-w-lg text-sm">O sistema identifica somente experiência profissional relevante para a operação contábil e para a distribuição da carteira.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Resumo profissional</p><p className="mt-2 text-sm leading-relaxed">{analise.resumo}</p></div>
                <Badge variant="secondary">{analise.metodo}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Grupo titulo="Senioridade" itens={analise.senioridade ? [analise.senioridade] : []} />
                <Grupo titulo="Regimes tributários" itens={analise.regimes} />
                <Grupo titulo="Segmentos" itens={analise.segmentos} />
                <Grupo titulo="Sistemas" itens={analise.sistemas} />
                <div className="md:col-span-2"><Grupo titulo="Competências profissionais" itens={analise.competencias} /></div>
              </div>
              {analise.observacoes.length ? (
                <div className="space-y-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Observações da leitura</p>{analise.observacoes.map((o, i) => <p key={i} className="text-sm">• {o}</p>)}</div>
              ) : null}
              <div className="space-y-2">
                <Label>Texto profissional extraído</Label>
                <Textarea value={analise.textoProfissional} readOnly rows={9} className="text-xs" />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || (!selecionado && !nomeNovo.trim())}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvar.isPending ? "Salvando…" : "Salvar no perfil BPO"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Grupo({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {itens.length ? itens.map((x) => <Badge key={x} variant="secondary">{x}</Badge>) : <span className="text-sm text-muted-foreground">Não identificado</span>}
      </div>
    </div>
  );
}