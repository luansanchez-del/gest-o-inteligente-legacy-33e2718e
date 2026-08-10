import { Link } from "../router-compat";

export function HomePage() {
  return (
    <main className="page">
      <h1>Gestão Contábil</h1>
      <p>Aplicação em construção.</p>
      <p>
        <Link to="/implantacoes">Ir para Implantações Contábeis →</Link>
      </p>
      <p>
        <Link to="/gestao-fechamentos">Ir para Gestão de Fechamentos →</Link>
      </p>
      <p>
        <Link to="/gestao-fechamentos/central">
          Ir para Central de Fechamentos (execução em lote) →
        </Link>
      </p>
    </main>
  );
}
