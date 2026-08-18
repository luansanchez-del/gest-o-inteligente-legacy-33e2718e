import { useMemo } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AnaliseCurriculo = {
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

type LinhaCarteira = {
  clientKey: string;
  nome: string;
  documento?: string | null;
  regime?: string | null;
  segmento?: string | null;
  responsavelPier?: string | null;
  responsavelCarteira?: string | null;
  peso: number;
  semCarteira: boolean;
};

function normalizar(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function contem(texto: string, termos: string[]) {
  return termos.some((t) => texto.includes(normalizar(t)));
}

function mesmo(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizar(a);
  const y = normalizar(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function rotuloAderencia(score: number) {
  if (score >= 80) return "Aderência técnica alta";
  if (score >= 60) return "Aderência técnica boa";
  if (score >= 40) return "Aderência técnica parcial";
  return "Evidências técnicas ainda insuficientes";
}

function perfilPredominante(analise: AnaliseCurriculo) {
  const texto = normalizar(
    `${analise.textoProfissional} ${analise.competencias.join(" ")} ${analise.resumo}`,
  );
  const contabil = contem(texto, [
    "fechamento",
    "conciliacao",
    "balancete",
    "balanco",
    "demonstracoes contabeis",
    "contabil",
  ]);
  const fiscal = contem(texto, [
    "fiscal",
    "tribut",
    "sped",
    "pis",
    "cofins",
    "icms",
    "obrigacoes acessorias",
  ]);
  const dp = contem(texto, ["folha", "departamento pessoal", "esocial", "e-social"]);
  const lideranca = contem(texto, ["lideranca", "coorden", "gerente", "treinamento de equipes"]);

  if (contabil && fiscal && lideranca) return "Generalista contábil-fiscal com liderança técnica";
  if (contabil && fiscal) return "Generalista contábil-fiscal";
  if (contabil && lideranca) return "Contábil com potencial de liderança técnica";
  if (fiscal && lideranca) return "Fiscal / tributário com liderança técnica";
  if (contabil) return "Contábil";
  if (fiscal) return "Fiscal / tributário";
  if (dp) return "Departamento Pessoal / Folha";
  return "Perfil profissional multidisciplinar";
}

function avaliarEscritorio(analise: AnaliseCurriculo) {
  const texto = normalizar(
    `${analise.textoProfissional} ${analise.competencias.join(" ")} ${analise.resumo}`,
  );
  let score = 0;
  const pontosFortes: string[] = [];
  const validar: string[] = [];
  const criterios: string[] = [];

  if (contem(texto, ["escritorio de contabilidade", "escritorio contabil", "contabilidade"])) {
    score += 20;
    pontosFortes.push("Vivência em ambiente contábil evidenciada");
    criterios.push("Experiência em escritório/contabilidade +20");
  }

  if (contem(texto, ["fechamento", "conciliacao", "balancete", "balanco", "demonstracoes contabeis"])) {
    score += 20;
    pontosFortes.push("Rotinas de fechamento, conciliação ou demonstrações contábeis");
    criterios.push("Fechamento e conciliações +20");
  } else {
    validar.push("Fechamento e conciliações não ficaram claramente evidenciados no currículo");
  }

  if (contem(texto, ["fiscal", "tribut", "sped", "obrigacoes acessorias", "pis", "cofins", "icms"])) {
    score += 20;
    pontosFortes.push("Experiência fiscal/tributária e obrigações acessórias");
    criterios.push("Fiscal, tributos e SPED +20");
  } else {
    validar.push("Experiência fiscal/tributária não ficou claramente evidenciada");
  }

  if (analise.regimes.length) {
    score += 15;
    pontosFortes.push(`Regimes tributários evidenciados: ${analise.regimes.join(", ")}`);
    criterios.push("Regimes tributários identificados +15");
  } else {
    validar.push("Lucro Real, Lucro Presumido e Simples Nacional não foram identificados explicitamente");
  }

  const questor = analise.sistemas.some((s) => normalizar(s).includes("questor"));
  if (questor) {
    score += 10;
    pontosFortes.push("Experiência com Questor evidenciada");
    criterios.push("Questor +10");
  } else if (analise.sistemas.length) {
    score += 6;
    pontosFortes.push(`Experiência com sistemas/ERP: ${analise.sistemas.join(", ")}`);
    validar.push("Experiência com Questor não foi evidenciada; validar adaptação ao sistema");
    criterios.push("Outros sistemas/ERP +6");
  } else {
    validar.push("Sistemas contábeis utilizados não ficaram evidenciados");
  }

  if (contem(texto, ["atendimento consultivo", "atendimento ao cliente", "cliente"])) {
    score += 5;
    pontosFortes.push("Atendimento ao cliente/consultivo evidenciado");
    criterios.push("Atendimento ao cliente +5");
  }

  if (contem(texto, ["lideranca", "coorden", "gerente", "treinamento de equipes"])) {
    score += 5;
    pontosFortes.push("Liderança ou treinamento de equipe evidenciado");
    criterios.push("Liderança técnica +5");
  }

  if (contem(texto, ["ciencias contabeis", "bacharel em ciencias contabeis", "contador"])) {
    score += 5;
    pontosFortes.push("Formação contábil evidenciada");
    criterios.push("Formação contábil +5");
  }

  score = Math.min(100, score);
  const confianca = analise.regimes.length && analise.competencias.length >= 5
    ? "Alta"
    : analise.competencias.length >= 3
      ? "Média"
      : "Baixa";

  return {
    score,
    rotulo: rotuloAderencia(score),
    perfil: perfilPredominante(analise),
    confianca,
    pontosFortes,
    validar,
    criterios,
  };
}

function compatibilidadeCliente(analise: AnaliseCurriculo, cliente: LinhaCarteira) {
  const texto = normalizar(
    `${analise.textoProfissional} ${analise.competencias.join(" ")} ${analise.resumo}`,
  );
  let score = 0;
  const motivos: string[] = [];
  const validar: string[] = [];

  const regime = analise.regimes.find((r) => mesmo(r, cliente.regime));
  if (regime) {
    score += 40;
    motivos.push(`experiência em ${cliente.regime}`);
  } else if (cliente.regime) {
    validar.push(`regime ${cliente.regime} não evidenciado no currículo`);
  }

  const segmento = analise.segmentos.find((s) => mesmo(s, cliente.segmento));
  if (segmento) {
    score += 25;
    motivos.push(`experiência no segmento ${cliente.segmento}`);
  }

  const contabil = contem(texto, ["fechamento", "conciliacao", "balancete", "balanco", "contabil"]);
  const fiscal = contem(texto, ["fiscal", "tribut", "sped", "obrigacoes acessorias"]);
  if (contabil) {
    score += 15;
    motivos.push("base contábil/fechamento compatível");
  }
  if (fiscal) {
    score += 10;
    motivos.push("base fiscal/tributária compatível");
  }

  const senior = /senior|sênior|lider|coorden|gerente|especialista/i.test(analise.senioridade ?? "") ||
    contem(texto, ["lideranca", "coordenador", "coordenadora", "gerente"]);
  if (senior) {
    score += cliente.peso >= 4 ? 10 : 6;
    motivos.push(cliente.peso >= 4 ? "senioridade compatível com maior complexidade" : "senioridade acima da complexidade básica");
  } else if (cliente.peso <= 2) {
    score += 5;
    motivos.push("complexidade inicial compatível");
  }

  if (analise.sistemas.some((s) => normalizar(s).includes("questor"))) {
    score += 5;
    motivos.push("Questor evidenciado");
  }

  score = Math.min(100, score);
  const confianca = regime && (segmento || cliente.segmento == null)
    ? "Alta"
    : regime || analise.competencias.length >= 5
      ? "Média"
      : "Baixa";

  return { score, motivos, validar, confianca };
}

export function AnalisePerfilCarteira({
  analise,
  linhas,
}: {
  analise: AnaliseCurriculo;
  linhas: LinhaCarteira[];
}) {
  const resultado = useMemo(() => {
    const escritorio = avaliarEscritorio(analise);
    const semCarteira = linhas.filter((l) => l.semCarteira);
    const clientes = semCarteira
      .map((cliente) => ({ cliente, ...compatibilidadeCliente(analise, cliente) }))
      .sort((a, b) => b.score - a.score || a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR"))
      .slice(0, 10);
    return { escritorio, semCarteira: semCarteira.length, clientes };
  }, [analise, linhas]);

  return (
    <div className="space-y-4 border-t pt-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Análise gerencial do perfil</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Mede somente evidências profissionais do currículo e a compatibilidade com a Carteira Inteligente. Não representa decisão de contratação.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <p className="font-semibold">Aderência ao escritório</p>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-semibold tabular-nums">{resultado.escritorio.score}%</span>
            <Badge variant="secondary">Confiança {resultado.escritorio.confianca.toLowerCase()}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${resultado.escritorio.score}%` }} />
          </div>
          <p className="mt-3 text-sm font-medium">{resultado.escritorio.rotulo}</p>
          <p className="mt-1 text-xs text-muted-foreground">Perfil predominante</p>
          <p className="text-sm font-medium">{resultado.escritorio.perfil}</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-primary" /><p className="font-semibold">Pontos fortes evidenciados</p></div>
            <div className="mt-3 space-y-2">
              {resultado.escritorio.pontosFortes.length ? resultado.escritorio.pontosFortes.map((p) => (
                <p key={p} className="text-sm">• {p}</p>
              )) : <p className="text-sm text-muted-foreground">Ainda não há evidências suficientes para destacar pontos fortes específicos.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-muted-foreground" /><p className="font-semibold">Pontos para validar</p></div>
            <div className="mt-3 space-y-2">
              {resultado.escritorio.validar.length ? resultado.escritorio.validar.map((p) => (
                <p key={p} className="text-sm">• {p}</p>
              )) : <p className="text-sm text-muted-foreground">Nenhum ponto adicional de validação foi identificado no currículo.</p>}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">“Não evidenciado” significa apenas que o currículo não trouxe informação suficiente — não significa ausência de conhecimento.</p>
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><p className="font-semibold">Clientes sem carteira mais compatíveis</p></div>
            <p className="mt-1 text-sm text-muted-foreground">
              {resultado.semCarteira} cliente(s) sem responsável oficial foram comparados com o currículo. A lista abaixo é apenas recomendação para revisão do gestor.
            </p>
          </div>
        </div>

        {!resultado.clientes.length ? (
          <p className="mt-4 text-sm text-muted-foreground">Não há clientes sem carteira para comparar neste momento.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {resultado.clientes.map(({ cliente, score, motivos, validar, confianca }, idx) => (
              <div key={cliente.clientKey} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                      <BriefcaseBusiness className="h-4 w-4" />
                      <p className="font-medium">{cliente.nome}</p>
                      <Badge variant="secondary">{score}% compatibilidade</Badge>
                      <Badge variant="outline">Confiança {confianca.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {cliente.regime ?? "Regime não informado"} · {cliente.segmento ?? "Segmento não informado"} · Peso {cliente.peso}
                    </p>
                    {motivos.length ? <p className="mt-2 text-sm">{motivos.join(" · ")}</p> : null}
                    {validar.length ? <p className="mt-2 text-xs text-muted-foreground">Validar: {validar.join(" · ")}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      PIER: {cliente.responsavelPier || "sem responsável"} · Carteira oficial: sem responsável
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <details className="rounded-md border p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Como a aderência técnica foi calculada</summary>
        <div className="mt-2 space-y-1">
          {resultado.escritorio.criterios.map((c) => <p key={c}>• {c}</p>)}
          <p>• A ausência de informação no currículo não reduz pontuação como se fosse falta de conhecimento; ela aparece em “Pontos para validar”.</p>
        </div>
      </details>
    </div>
  );
}
