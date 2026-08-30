# Diagnóstico da "Equação patrimonial não fecha"

## Resposta curta

Não. A fórmula usada já é a de um balancete **antes** do encerramento do resultado:

```text
Ativo + Despesas  =  Passivo/PL + Receitas
```

Ou seja, o lucro ainda não transferido para o PL já está previsto nos dois lados. Se o balancete estivesse encerrado (resultado zerado nas contas de resultado), Receitas e Despesas seriam 0 e a equação viraria Ativo = Passivo/PL — e continuaria fechando.

No seu caso a diferença é **R$ 259.969,13** (3.529.515,57 − 3.789.484,70). Isso indica outra coisa: um grupo do balancete não foi somado corretamente. As causas mais prováveis, em ordem:

1. Um grupo raiz (tipicamente Passivo/PL) teve a linha-resumo mal extraída do PDF, então entra somado por baixo.
2. Existem contas de compensação ou um grupo extra (5/6/9) classificado como "OUTRO" e ignorado dos dois lados.
3. Um grupo tem o nível mais raso diferente dos demais e a soma pega linhas parciais.

Hoje o alerta não diz **qual** grupo está fora — por isso é impossível decidir olhando só a mensagem. O plano abaixo torna isso visível antes de mexer em qualquer regra.

## O que será feito

### 1. Detalhamento por grupo no alerta

O achado `EQUACAO_PATRIMONIAL_DIVERGENTE` passa a trazer, na evidência e no detalhe, a composição por grupo raiz:

- código da raiz, nome da linha-resumo, natureza atribuída, nível usado na soma, quantas linhas do grupo entraram e o saldo somado;
- lista de grupos classificados como `OUTRO` (ignorados na equação) com seus saldos — é aqui que compensação/grupos extras aparecem.

### 2. Alerta específico para grupo ignorado

Se existir grupo `OUTRO` com saldo material, é emitido um achado próprio (`GRUPO_NAO_CLASSIFICADO`, WARNING + revisão humana) nomeando o grupo e o valor, em vez de o valor sumir silenciosamente da conta.

### 3. Conferência cruzada da diferença

Quando a diferença da equação coincidir (dentro da tolerância) com o saldo de um único grupo ignorado ou com o saldo de uma raiz somada em nível diferente dos demais, o detalhe do alerta aponta explicitamente essa coincidência como causa provável de leitura, não como erro do cliente.

### 4. Exibição na tela de detalhe da solicitação

O painel de achados mostra a tabela por grupo quando ela existir na evidência, para o revisor ver de imediato onde está o buraco.

## Detalhes técnicos

- `src/server/domain/validacao/balancete.validator.ts`: extrair a montagem de `base` para uma função que devolve, além das linhas, um resumo por raiz (`raiz`, `nome`, `natureza`, `nivelUsado`, `linhas`, `saldo`, `debito`, `credito`). Alimentar a evidência dos achados de equação e o novo achado `GRUPO_NAO_CLASSIFICADO`. Nenhuma severidade existente muda: divergência continua WARNING + `requiresHuman`.
- `src/routes/_authenticated/gestao.solicitacoes.$externalId.tsx`: renderizar a composição por grupo quando `evidence.grupos` estiver presente.
- Testes em `src/server/domain/validacao/__tests__/balancete.validator.test.ts`: caso com grupo de compensação material (gera `GRUPO_NAO_CLASSIFICADO`) e caso onde a diferença bate com o grupo ignorado (detalhe aponta causa de leitura).

Nada de Carteira, carga de competências, filtros ou regras de escrita no PIER é tocado.

## Fora deste plano

Corrigir automaticamente a soma (ex.: incluir grupos 5/6/9 na equação) só depois que o diagnóstico mostrar, neste balancete real, qual grupo está fora — mudar a fórmula antes disso arrisca mascarar erro real do cliente.
