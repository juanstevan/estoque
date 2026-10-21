# Auditoria técnica do Inventário: Fase 1

Data: 21/10/2026. Escopo: leitura do código em `main` (commit `2663a7d`). Nesta fase nada foi alterado: código, schema, banco e dados de produção ficaram intactos. Também não houve nenhuma consulta ao banco de produção. Onde um achado depende dos dados reais, ele está marcado como **hipótese**, junto com a consulta somente-leitura que o confirma.

> ⚠️ O repositório `juanstevan/estoque` é público. Este arquivo descreve falhas exploráveis e caminhos de corrupção de dados, então **não o commite**. Ele está fora do controle de versão (untracked).

---

## 1. Arquitetura relevante

**Stack**
- Next.js 16 (App Router) com rotas em `src/app/api/*`. Não há Server Actions: toda escrita passa por `fetch` para uma rota de API.
- Prisma 7 com PostgreSQL.
- A lógica de negócio fica em `src/lib/*`.

**Modelos e campos de estoque** (`prisma/schema.prisma`)

| Modelo | Papel | Campos de quantidade/custo |
|---|---|---|
| `Product` | Saldo atual, desnormalizado | `physicalQty`, `reservedQty`, `availableQty`, `avgCost`, `inventoryValue`, `fobCost`, `cifCost`, `lastSoldPrice`. Os campos `waitingPickupQty`, `waitingDeliveryQty` e `unavailableQty` existem mas **nunca são escritos** (legado). |
| `InventoryTransaction` | Movimento (log) | `type`, `quantity` (delta), `unitCost`, `totalValue`, `reference`, `notes`, `userId`, `metadata` (JSON em texto) |
| `CostHistory` | Foto do custo após uma entrada com custo | `quantityDelta`, `unitCost`, `resultingAvgCost/Qty/Value`. Relação 1:1 com a transação. |
| `Importation` / `ImportationLine` | Recebimento (importação) | Custos adicionais no cabeçalho. A linha guarda `quantity`, `purchaseUnitCost` (FOB), `allocatedAdditionalCost` e `landedUnitCost` (CIF). |
| `Order` / `OrderLine` | Cópia local da invoice do QuickBooks | A linha guarda `orderedQty`, `reservedQty`, `deliveredQty`, `remainingQty`, `unitPrice` e `physical`. `pickedQty`, `waitingPickupQty` e `scannedQty` são legado e sempre valem 0. |
| `Delivery` / `DeliveryLine` | Viagem ou coleta (parte de uma invoice) | `status`, `stockOutAt` (trava de baixa única), `qty`, `preparedQty` |
| `OrderEvent` | Log textual da invoice | `kind`, `message`, `actor` (nome), `meta` |
| `OrderProof` | Fotos de entrega e da invoice assinada | `url`, `kind`, `public` |
| `QbSyncEvent` | Cópia bruta de cada payload de invoice ingerido | `payload`. O campo `processed` nunca é usado. |
| `Sale` | Vendas para relatórios (Reports) | É independente do estoque e não movimenta nada. |

**Serviços e quem escreve estoque**

| Arquivo | Funções | Efeito no estoque |
|---|---|---|
| `src/lib/inventory/service.ts` | `appendTransaction` | **Único** caminho que altera `physicalQty`/`avgCost` com log |
| | `changeQuantity` / `adjustInventory` | Ajuste manual |
| | `createProduct` | Estoque inicial |
| | `upsertImportation` | Rascunho da importação (não movimenta) |
| | `setImportStatus` | Muda status. Ao concluir chama `confirmImportation`; ao reabrir chama `reopenImportation`. |
| | `confirmImportation` | Entrada de estoque com custo |
| | `reopenImportation` | Estorno da entrada |
| | `deleteProduct` | Apaga o produto junto com o histórico |
| `src/lib/inventory/orders.ts` | `reserveOrder` / `releaseOrder` / `changeReserved` | Reserva |
| | `stockOut` | Baixa física |
| | Fluxo das entregas (`addToWorkflow`, `moveDelivery`, `completeDelivery`, …) | Workflow que dispara reserva e baixa |
| `src/lib/quickbooks/ingest.ts` | `ingestInvoice` | Cria ou atualiza `Order`; mexe em reservas |
| | `ingestItems` | Cria produtos com estoque inicial |
| `src/lib/quickbooks/sync.ts` | `syncQuickBooks` / `runSync` / `pullItems` | Sincronização (nome, SKU e preço; nunca quantidade) |

**APIs que movimentam estoque**

| Rota | Permissão | O que faz |
|---|---|---|
| `POST /api/adjustments` | storage ou imports com edição | `changeQuantity` |
| `POST /api/importations` | imports com edição | Ações `save`, `status` e `delete` |
| `POST /api/importations/[id]` | imports com edição | `confirmImportation` direto |
| `POST /api/orders` | delivery com edição | Ações `add`, `remove`, `move`, `complete`, `split`, `scan`, … |
| `POST /api/quickbooks` | segredo `QB_SYNC_SECRET` | `ingestInvoice` / `ingestItems` / `sync` |
| `POST /api/quickbooks/webhook` | HMAC da Intuit | Só ativa se `QB_WEBHOOK_VERIFIER` estiver definida |
| `GET /api/quickbooks/cron` | `CRON_SECRET` | Sync diário |
| `POST /api/orders {action:"sync"}` | Qualquer usuário logado | Sync automático, disparado a cada minuto pelas abas abertas |

`POST /api/import-export` (planilha) cria e atualiza produtos, mas **não** quantidades: `updateProduct` descarta os campos de estoque em `service.ts:293-310`.

**Uploads**
- Prova de entrega: em produção, o cliente envia a foto direto ao Vercel Blob (`/proofs/`), e `POST /api/orders {action:"proof"}` só aceita URLs desse blob (`ownedBlob`). Em dev, usa multipart e `saveProofFile`.
- A conclusão exige ao menos uma foto (`completeDelivery`, `orders.ts:768-769`).
- **Recebimentos (importações) não têm fotos nem uploads.** Não existe campo, rota ou UI para isso.

**Testes automatizados**

São três scripts de `assert`, sem test runner e sem script `test` no `package.json`:
- `src/lib/inventory/delivery-rules.test.ts`: regras puras de estágio/pagamento.
- `src/lib/quickbooks/ingest.test.ts`: parsing de nomes e invoice, `changedFields`.
- `src/lib/catalog/rich-text.test.tsx`.

**Nenhum teste cobre** `appendTransaction`, `calcWeightedAverageCost`, `confirmImportation`, `reopenImportation`, `changeQuantity`, `stockOut` ou `ingestInvoice` com banco. `scripts/smoke.mjs` está desatualizado: envia `quantityDelta`, que a API atual não aceita.

**Código morto relacionado**
- Componentes `InventoryDashboard`, `InventoryTable`, `ProductDetailModal`, `AdjustModal`, `BulkReceiveModal` e `ProductFormModal`: nenhuma página os importa.
- `StubQuickBooksAdapter` e `describeQbFlow` (`adapter.ts`).
- Os tipos `TransactionType` `SOLD`, `CORRECTION`, `PICKED_UP`, `DELIVERED`, `RELEASED` e `TRANSFER`. Os únicos usados são `RECEIVED`, `IMPORTATION`, `ADJUSTMENT`, `RETURNED`, `RESERVED` e `SOLD`.

---

## 2. Mapa dos cálculos de estoque e custo

| Grandeza | Onde é guardada | Fórmula efetiva | Onde é aplicada | Divergências possíveis |
|---|---|---|---|---|
| **Físico** | `Product.physicalQty` | `físico += quantity` de cada transação com `affectsPhysical`. Recusa resultado < 0. | `appendTransaction` (`service.ts:100-105`) | `reopenImportation` subtrai **direto**, sem transação, sem log e sem checar negativo (`service.ts:729-740`). Não há check constraint no banco. |
| **Reservado** | `Product.reservedQty` e `OrderLine.reservedQty` | `reservado = max(0, reservado + delta)` | `changeReserved` (`orders.ts:153-162`), `stockOut` (`:239-249`) e quatro blocos copiados em `ingest.ts` (`:296-307`, `:402-411`, `:429-438`, `:444-453`) | O `max(0, …)` **esconde deriva**. Nada recalcula `Product.reservedQty` a partir da soma de `OrderLine.reservedQty`. |
| **Disponível** | `Product.availableQty` | `físico − reservado` (`math.ts:83-91`). Ignora os parâmetros `waiting*` e `unavailable`. | Recalculado a cada escrita acima | Pode ficar **negativo**: a reserva não checa disponibilidade (`reserveOrder`, `orders.ts:164-191`). O catálogo usa `availableQty > 0` (`catalog/service.ts:231`) e o MediaModel mostra o mesmo campo. |
| **Entrada por recebimento** | Transação `IMPORTATION` + `CostHistory` | `quantity = line.quantity`, `unitCost = landedUnitCost` | `confirmImportation` (`service.ts:775-865`) | Sempre soma ao físico. **Não existe modo "só custo"** (ver P0-4). |
| **Saída por entrega** | Transação `SOLD` (quantidade negativa) | Uma vez por `Delivery`, protegida por `stockOutAt` | `stockOut` (`orders.ts:217-262`), chamada no estágio configurado (`stockStage`: ready, out ou completed) | Usa `avgCost` corrente como `unitCost`, e o valor fica `físico × avgCost` |
| **Cancelamento** | — | Antes da baixa: `removeFromWorkflow` ou void no QB liberam a reserva. **Depois da baixa não existe estorno.** O void ou a mudança no QB só gravam `Order.issues`. | `orders.ts:412-426`, `ingest.ts:283-329` | O problema fica sinalizado, mas não há fluxo para resolvê-lo |
| **Devolução** | Transação `RETURNED` | Ajuste manual cujo motivo é exatamente "Return": soma ao físico **e recalcula o custo médio com o preço digitado** | `changeQuantity` (`service.ts:478-493`) | Não liga a devolução à invoice nem à entrega de origem |
| **Garantia** | — | Não existe conceito próprio. "Warranty" é só um texto de motivo de ajuste (`AppSettings.adjustmentReasons`). | — | **Regra a definir** |
| **Correção manual** | Transação `ADJUSTMENT` | Adicionar soma ao físico e recalcula o custo médio com o preço do formulário (padrão = `avgCost`). Remover subtrai e mantém a média. | `changeQuantity` | Uma correção de quantidade **mexe no custo** se o preço for alterado. Além disso, `cifCost` é sobrescrito pelo preço digitado (`service.ts:152`). |
| **FOB** | `Product.fobCost` | `purchaseUnitCost` da **última** importação concluída, ou o custo inicial na criação | `confirmImportation` (`service.ts:847-850`) | Não é média. Não há campo de moeda. |
| **CIF** | `Product.cifCost` | `landedUnitCost` da última entrada com custo: FOB + rateio dos adicionais por valor | `allocateAdditionalCosts` (`math.ts:38-81`) e `appendTransaction` (`:152`) | O "CIF" inclui frete interno, desembaraço e duties (`transferFee`, `freight`, `delivery`, `duties`, `customs`, `otherCosts`). Na prática é um custo *landed*, não CIF no sentido Incoterm. **Ambiguidade de nomenclatura.** Um ajuste manual com custo também o sobrescreve. |
| **Custo médio** | `Product.avgCost`, `inventoryValue` | Média ponderada móvel: `valor = valor + qtd·custo` e `média = valor / físico` (`math.ts:6-22`). Na saída, o valor fica `físico × média` e a média não muda. | `appendTransaction` | Diluída por estoque de custo 0 (P1-3). Quebrada por reabrir uma importação (P0-3). |
| **Coeficiente** | `Importation.coefficient` | `(subtotal + adicionais) / subtotal` | `upsertImportation` e `confirmImportation` | Só informativo; não entra no cálculo |

**Custo inicial (hipótese):** o `avgCost` do estoque base parece ter vindo de duas fontes:
- `prisma/enrich-catalog.ts` (`applyCatalogCost`): reescreve a transação `INITIAL` e o `CostHistory` com o custo de uma lista de preços HTML.
- `ingestItems`: cria produtos do QuickBooks com `QtyOnHand` a **custo 0** (`ingest.ts:517-526`; `initialUnitCost` não é passado).

Consulta para confirmar:

```sql
SELECT p.code, p.name, p."physicalQty", p."avgCost", p."fobCost", p."cifCost"
FROM "Product" p WHERE p."physicalQty" > 0 AND (p."avgCost" = 0 OR p."fobCost" = 0) ORDER BY p.code;
```

---

## 3. Fluxo de importação e recebimento

```
criar/editar (upsertImportation) ──► PENDING ──► IN_TRANSIT ──► COMPLETED (confirmImportation: +estoque, custo)
                                          └──► DELAYED (automático se expectedDate < hoje, ao listar)
COMPLETED ──(arrastar para outra coluna ou "Undo")──► reopenImportation: −estoque, apaga transações e CostHistory
```

**Datas**
- `expectedDate` é a data prevista. Quando passa, o status vira `DELAYED` em `applyOverdueDelays`, que é uma **escrita disparada por um GET** (`listImportations`).
- `receivedAt` é a data efetiva, mas é sempre `new Date()` no momento da conclusão (`service.ts:857`). **Não é possível informar a data real de recebimento**, e as transações também ficam com a data de hoje. A UI não exibe `receivedAt`.

**Como a quantidade entra**

`confirmImportation` percorre as linhas:
1. Se a linha não tem produto, cria um (nome do rascunho, sem checar duplicata).
2. Grava `allocatedAdditionalCost` e `landedUnitCost` na linha.
3. Chama `appendTransaction(IMPORTATION, +qtd, custo = landed, affectsCost)`.
4. Atualiza `fobCost` e `cifCost` do produto.

Tudo roda dentro de um `prisma.$transaction`.

**Conclusão em dobro**

A proteção é só `if (status === COMPLETED) throw`. A leitura não usa `FOR UPDATE` na `Importation` (`service.ts:777-783`). Dois pedidos simultâneos leem PENDING e os dois somam estoque (P0-1).

**Edição de importação concluída**
- A edição é bloqueada em `upsertImportation` (`service.ts:594`).
- O caminho real de correção (reabrir → editar → concluir) corrompe o custo médio (P0-3).

**Importações históricas (somente custo)**
- **Não suportado.** Toda conclusão soma `line.quantity` ao físico.
- Não há flag, tipo de transação ou caminho para registrar uma importação passada que contribua para o custo médio sem mexer na contagem física (P0-4).

**Fotos, uploads e integração**
- Recebimentos não têm fotos (não existe requisito implementado).
- A conclusão não depende do QuickBooks.

---

## 4. Reserva, entrega, cancelamento e devolução

1. **Entrada.** A invoice chega pelo sync e vira `Order` + `OrderLine`, sem reserva. A linha é marcada `physical` por regex no nome (`isPhysicalLine`, `delivery-rules.ts:35-39`). O produto é casado por SKU, depois pelo item QB (`secondarySku = qb:<id>`), depois pelo **nome exato** e por fim pelo **código no início do nome** (`findProduct`, `ingest.ts:129-152`).
2. **"Add to workflow"** (`addToWorkflow`, com lock na Order):
   - reserva `orderedQty` de cada linha física (`Product.reservedQty += qtd`), **sem checar disponibilidade**;
   - cria a Delivery 1 com todas as linhas;
   - grava uma transação `RESERVED` de quantidade 0.
   - É idempotente: se já existe uma delivery, só devolve o estado.
3. **Preparação.** Contagem manual ou scan (o scan é idempotente via `scanId`). A divisão em várias entregas move unidades para a próxima delivery, que continuam reservadas.
4. **Baixa física.** Ocorre no estágio configurado (`stockStage`, padrão `completed`) via `stockOut`:
   - um `SOLD` negativo por linha (`appendTransaction`, com lock no produto; falha se o físico ficar < 0);
   - diminui o reservado e grava `stockOutAt`.
   - **A baixa dupla está protegida:** tudo roda dentro do lock da Order, `stockOutAt` é checado (`orders.ts:222`) e `completeDelivery` retorna cedo se já está COMPLETED.
5. **Cancelamento antes da baixa.** "Back to New" (`removeFromWorkflow`) libera a reserva e apaga as deliveries. Um void no QB faz o mesmo (`ingest.ts:295-328`).
6. **Cancelamento ou devolução depois da baixa.** **Não há fluxo.** A invoice fica "congelada" e recebe só um aviso em `Order.issues`; o estoque não volta. A devolução física precisa ser lançada como ajuste manual "Return", que não fica ligado à invoice e mexe no custo médio.

---

## 5. Integração Delivery ↔ QuickBooks

**Como as invoices são obtidas**
- Fontes: polling, `TxnDate >= 2026-10-01` (`INVOICES_FROM`), mais o CDC dos últimos 28 dias (para pegar exclusões) e, opcionalmente, o webhook.
- Cada payload é gravado em `QbSyncEvent`. A `Order` é uma **cópia local**, atualizada quando `MetaData.LastUpdatedTime` avança.
- As telas leem só a cópia; não consultam o QB ao vivo.

**Mudanças posteriores** (`ingestInvoice`)

| Situação | Efeito |
|---|---|
| Fora do workflow ("quiet") | Apaga e recria as linhas |
| No workflow, sem baixa | Aplica a diferença na reserva e ajusta as deliveries abertas (`fitDeliveries`). Uma delivery pronta que ficou curta volta para Preparing. |
| Alguma baixa ou envio já feito ("frozen") | Atualiza só preço e cabeçalho; mudanças de itens geram `issues` |
| Void ou delete | Antes da baixa, libera a reserva. Depois, só gera `issues`. |

**Erros apresentados ao usuário**
- Falhas no sync vão para `AppSettings.qbSyncError` e aparecem no Delivery (`deliveryMeta`).
- Uma invoice que falha não bloqueia as outras e volta a ser tentada no sync seguinte.
- Falhas de upload aparecem como mensagem na ação (`"The photo didn't upload."`).
- O campo `issues` mostra o problema, mas **não existe ação para resolvê-lo ou marcá-lo como revisado**.

**Riscos de integração**
- `ingestInvoice` **não faz lock na Order** e decide o caminho a partir de uma leitura feita fora da transação (`ingest.ts:217`, `:279`).
- Execuções simultâneas acontecem de fato:
  - a trava do sync dura só 55 s (auto) ou 5 s (manual) (`sync.ts:55-58`), e o próprio código diz que a primeira importação leva minutos;
  - o webhook não usa trava nenhuma;
  - o sync processa 8 invoices em paralelo.
- Detalhes em P1-1, P1-2 e P1-4.

---

## 6. Riscos e inconsistências priorizados

Cada item traz:
1. Comportamento atual
2. Esperado
3. Evidência
4. Consequência
5. Risco de mexer nos dados
6. Correção
7. Testes
8. Dependências

### P0: crítico (integridade de estoque e custo)

**P0-1. Conclusão de importação pode somar o estoque duas vezes.** *Comprovado no código.*
1. `confirmImportation` checa `status !== COMPLETED` sem travar a linha da importação. Dois pedidos concorrentes passam pelo check. O lock por produto só serializa as escritas: o segundo pedido soma de novo depois que o primeiro faz commit.
2. Concluir uma vez só, de forma idempotente.
3. `service.ts:776-783`, chamada por `setImportStatus` (`:682-699`) e pela rota `POST /api/importations/[id]`. Na UI, o arraste para Completed dispara `persistStatus` em segundo plano (`ImportsTab.tsx:453+`), sem bloquear novos arrastes.
4. Estoque físico e valor inflados.
5. Nenhum.
6. `SELECT … FROM "Importation" WHERE id = $1 FOR UPDATE` no início da transação, e só então checar o status. Melhor ainda: um `updateMany({ where: { id, status: { not: COMPLETED } } })` que "reivindica" a conclusão e aborta se `count = 0`.
7. Teste de integração: dois `confirmImportation` em paralelo → físico +qtd uma única vez e uma única transação `IMPORTATION`.
8. Nenhuma.

**P0-2. Reabrir importação pode subtrair o estoque duas vezes e deixá-lo negativo.** *Comprovado no código.*
1. `setImportStatus` lê o status fora da transação (`:683`). `reopenImportation` não recheca se ainda está COMPLETED e subtrai `line.quantity` direto do produto:
   - sem `appendTransaction`;
   - sem checar físico negativo;
   - sem checar reservas.

   Dois pedidos de reabertura (por exemplo, "Undo" com duplo clique, ou um arraste seguido de "Undo") subtraem duas vezes.
2. Estornar uma vez só e só o que entrou. Recusar se o físico ficaria negativo.
3. `service.ts:700-702` e `:717-765`. "Undo" e arraste em `ImportsTab.tsx:437-451` e `:453+`.
4. Físico menor que o real e possivelmente negativo; disponível negativo.
5. Nenhum.
6. Lock na importação + recheck do status. Estornar pela própria transação de origem, com uma transação de estorno em vez de apagar (ver P0-3). Recusar se `físico − qtd < 0`.
7. Duas reaberturas em paralelo. Reabrir depois de vender parte → erro claro.
8. P0-3.

**P0-3. Reabrir importação apaga o histórico e não restaura o custo médio.** *Comprovado no código.*
1. A reabertura:
   - apaga as transações `IMPORTATION` e o `CostHistory` (`service.ts:742-758`);
   - recalcula o valor como `novoFísico × avgCost atual`;
   - mantém o `avgCost`, que já inclui o custo da importação;
   - mantém `fobCost` e `cifCost`.

   Exemplo sem vendas: 10 un a $50 + importação de 10 un a $100 dá média $75. Reabrir deixa 10 un com média **$75** (deveria ser $50). Reconcluir com $110 dá média **$92,50**; o correto seria $80.

   Com vendas no meio, o valor fica negativo.
2. O estorno devolve físico **e** valor exatamente como estavam antes da entrada. O histórico nunca é apagado.
3. `service.ts:717-765`.
4. Custo médio errado de forma permanente, perda de rastreabilidade e inconsistência financeira. É o **único caminho para corrigir custos de uma importação concluída** (a edição é bloqueada), então tende a ser usado.
5. Os dados atuais podem já estar afetados. Uma correção não deve reescrever médias existentes automaticamente: primeiro, um relatório somente-leitura.
6. Trocar por:
   - uma transação de estorno (tipo novo ou `IMPORTATION` negativo, ligada à original por `metadata.reversalOf`);
   - que retira o **valor da entrada** (`qtd × landed`), não `qtd × média`.
   - Para correção de custo **sem** mexer em quantidade, criar um "ajuste de custo" próprio (ver P1-5).
7. Cenário do exemplo acima, assertando a média de $50 após reabrir e de $80 após reconcluir. Histórico preservado.
8. Bloqueia P0-4 e P1-5.

**P0-4. Não existe importação "só custo" (histórica).** *Comprovado no código.*
1. Toda conclusão soma unidades ao físico.
2. Premissa do usuário: importações históricas entram para reconstruir o custo médio **sem** alterar o físico já contado.
3. `confirmImportation`, `service.ts:830-846`. Não há flag no schema.
4. Registrar o histórico hoje duplicaria o estoque contado.
5. Alto se for feito por script. Precisa de um modo explícito.
6. **Regra a definir:** como uma importação histórica afeta a média?

   | Opção | Como funciona | Observação |
   |---|---|---|
   | (a) | Recalcular a média de cada produto como média ponderada de todas as importações históricas e aplicá-la ao físico atual: `valor = físico × média histórica` | |
   | (b) | Média móvel cronológica, tratando as vendas anteriores a outubro como saídas desconhecidas | Exige FIFO/vendas, o que está **fora do escopo** |

   Recomendação provisória: (a), com uma flag `Importation.historical` (ou `affectsStock = false`) e um tipo de transação `COST_BASIS` de quantidade 0, que só grava `CostHistory`. Também é preciso permitir informar a data efetiva (P1-6).
7. Concluir uma importação histórica → físico inalterado; média = média ponderada esperada; nova importação normal depois → média móvel a partir dessa base.
8. Depende de P0-3 (estorno correto) e de P1-6 (data efetiva).

**P0-5. Scripts de seed apagam o banco apontado pelo `.env`, que é o de produção.** *Comprovado no código.*
1. `prisma/seed.ts:89-99` faz `deleteMany` em produtos, transações, importações, invoices, usuários e configurações, e recria um admin com senha fixa `chaleur`. `npm run setup` e `npm run db:seed` o executam. `npm run db:reset` faz `prisma migrate reset --force`. Nenhum desses caminhos tem guarda contra produção.
2. Recusar a execução fora de um banco local.
3. `package.json` (scripts `setup`, `db:seed`, `db:reset`) e `prisma/seed.ts`.
4. Perda total de dados com um comando.
5. Nenhum (é só um guarda).
6. Guarda no topo do seed: exigir `DATABASE_URL` com `localhost` e uma variável `ALLOW_SEED=1`. Remover `db:reset` ou exigir o mesmo guarda.
7. Rodar o seed com uma URL não local → aborta.
8. Nenhuma. É o mais barato de corrigir.

### P1: alto

**P1-1. Sync concorrente (ou webhook + sync) pode aplicar a mesma mudança de invoice duas vezes.** *Comprovado no código; a frequência real é hipótese.*
1. Duas execuções de `ingestInvoice` para a mesma invoice leem o mesmo `existing` e as duas aplicam `delta` à reserva do produto (`ingest.ts:416-439`). A trava do sync expira em 55 s ou 5 s, menos que a duração de um sync longo, e o webhook não usa trava.
2. Cada versão da invoice é aplicada uma única vez.
3. `sync.ts:55-58` e `:242-254`; `webhook/route.ts:42-44`; `ingest.ts:217-219`.
4. `Product.reservedQty` inflado e disponível subestimado; o catálogo pode mostrar "out of stock" indevido.
5. Baixo.
6. Dentro da transação: `SELECT … FROM "Order" … FOR UPDATE`, reler a Order e rechecar `qbUpdatedAt`. Fazer a trava do sync durar até o fim da execução (lease renovado, ou `pg_try_advisory_lock`).
7. Duas ingestões paralelas da mesma versão → reserva alterada uma vez.
8. Base para a tarefa de sincronização de invoices.

**P1-2. Ingestão sem lock disputa com ações do usuário.** *Comprovado no código.*
1. O caminho "quiet" (`ingest.ts:361-382`) apaga e recria `OrderLine` **fora de transação** e sem lock. Se o usuário clicar "Add to workflow" ao mesmo tempo, a reserva já gravada no produto perde a linha que a sustentava e fica **órfã para sempre**; a delivery perde as linhas por cascade.

   No caminho com transação, `reservedQty: line.quantity` (`:425`) sobrescreve a reserva da linha com base em um `existing` lido antes, podendo recriar reserva de unidades que um `stockOut` concorrente acabou de baixar.
2. Ingestão e workflow serializados pela Order.
3. `ingest.ts:361-382` e `:384-477`; `orders.ts:385-410`.
4. Reserva fantasma; delivery vazia.
5. Baixo.
6. Mesmo lock de P1-1 em todos os caminhos de `ingestInvoice`, incluindo o void (que hoje apaga as deliveries fora da transação, `:323`).
7. Teste concorrente de `addToWorkflow` + `ingestInvoice`.
8. P1-1.

**P1-3. Estoque inicial a custo zero dilui o custo médio.** *Comprovado no código; a extensão nos dados é hipótese.*
1. `ingestItems` cria produtos com `QtyOnHand` como entrada `RECEIVED` a custo 0 e `affectsCost: true`. Média = 0. A primeira importação então tira a média entre o estoque "grátis" e a importação. Ex.: 10 un a $0 + 5 un a $100 dá média $33,33.
2. A base de custo do estoque contado deve vir das importações (premissa do usuário).
3. `ingest.ts:517-526`; `service.ts:269-281`.
4. Custo médio e valor de estoque subestimados.
5. Corrigir exige recalcular `inventoryValue` e `avgCost`. Fazer só via P0-4 e após revisão.
6. Não criar estoque inicial com custo 0 como entrada com custo. Usar `affectsCost: false` com valor pendente e marcar "custo desconhecido". A média passa a vir de P0-4.
7. Criar produto do QB → média não definida; importação histórica define a base.
8. P0-4.

**P1-4. Mesmo item em duas linhas da invoice quebra a atualização.** *Comprovado no código.*
1. Na atualização, cada linha casada procura a linha existente **pelo productId** (`ingest.ts:388`). Com duas linhas do mesmo produto, as duas atualizam a mesma `OrderLine`: a segunda sobrescreve a quantidade da primeira, as deltas de reserva somam errado e a segunda `OrderLine` existente nunca é atualizada nem removida (`seen` contém o produto). O check `linesChanged` do caminho frozen tem o mesmo defeito (`:333-335`).
2. Casar linha a linha (pelo `Line.Id` do QuickBooks) ou agregar por produto.
3. `ingest.ts:384-456`.
4. Reserva e quantidades da invoice erradas.
5. Baixo.
6. Guardar `qbLineId` em `OrderLine` (migração aditiva) e casar por ele. Alternativa sem migração: agregar `matched` por produto antes de comparar.
7. Invoice com o mesmo SKU em duas linhas, alterando uma delas.
8. Tarefa de sincronização de invoices.

**P1-5. Correção de quantidade e correção de custo são a mesma operação.** *Comprovado no código.*
1. "Change quantity → Add" recalcula a média com o preço do formulário (`affectsCost: true`) e **sobrescreve `cifCost`** (`service.ts:152`, `:492`). "Return" faz o mesmo. Não há forma de corrigir só o custo, nem só a quantidade sem efeito de custo, quando o preço é alterado.
2. Separar as duas coisas.
   - Correção de quantidade: entra ou sai pelo custo médio atual, sem tocar `cifCost`/`fobCost`.
   - Correção de custo: quantidade 0, com valor anterior → novo.
3. `changeQuantity` (`service.ts:467-496`); formulário em `ProductDialog.tsx:1446-1500`.
4. Custo médio e CIF alterados por operações de contagem.
5. Nenhum para novos lançamentos.
6. Remover o preço do ajuste de quantidade (ou travá-lo no `avgCost`). Criar `COST_ADJUSTMENT` com motivo obrigatório e guardar `before`/`after` em `metadata`. Não sobrescrever `cifCost` fora de importação.
7. Ajuste +5 → média e CIF inalterados; ajuste de custo → quantidade inalterada, `CostHistory` com valores antes e depois.
8. P0-4.

**P1-6. Data efetiva de recebimento não pode ser informada.** *Comprovado no código.*
1. `receivedAt` e `occurredAt` são sempre "agora".
2. Informar a data real, obrigatória para importações históricas.
3. `service.ts:857`; `appendTransaction` usa `occurredAt ?? new Date()`.
4. O histórico de custo fica em ordem errada; relatórios por data ficam errados.
5. Nenhum.
6. Campo de data na conclusão (padrão hoje), passado a `receivedAt` e às transações.
7. Concluir com data passada → `CostHistory.occurredAt` = data informada.
8. P0-4.

**P1-7. Ajustes e importações são registrados como "admin".** *Comprovado no código.*
1. As rotas de ajuste e de importação usam `deny()`, que descarta o usuário (`guard.ts:28-31`). `appendTransaction` grava `userId: currentUserId()`, que é a constante `"admin"` (`user.ts:1-3`). O log mostra "Juan Souza" para qualquer pessoa. Deliveries gravam o ator correto.
2. Cada movimento registra quem o fez.
3. `api/adjustments/route.ts`, `api/importations/route.ts`, `api/importations/[id]/route.ts`, `service.ts:139`.
4. Não dá para auditar quem corrigiu estoque ou custo.
5. Os registros antigos não têm como ser corrigidos; documentar a data de corte.
6. Usar `guard()` e passar `me.id` até `changeQuantity`, `confirmImportation`, `reopenImportation` e `upsertImportation` (`createdBy`).
7. Ajuste feito por um usuário B → `userId = B`.
8. Nenhuma.

**P1-8. Reserva sem checar disponibilidade; baixa pode travar a entrega.** *Comprovado no código. A regra precisa ser confirmada.*
1. `reserveOrder` reserva mesmo sem físico, e o disponível fica negativo. Na baixa, `appendTransaction` recusa físico < 0 e a entrega não conclui ("Insufficient quantity").
2. **Regra a definir:** permitir reserva acima do disponível (backorder) ou bloquear/alertar ao adicionar ao workflow?
3. `orders.ts:164-191`; `service.ts:100-105`.
4. Disponível negativo no estoque e no catálogo; a entrega fica presa sem explicação prévia.
5. Nenhum.
6. Depende da regra. No mínimo, avisar ao adicionar e mostrar a falta na delivery.
7. Conforme a regra escolhida.
8. Nenhuma.

**P1-9. Não existe estorno de baixa (cancelamento/devolução de invoice entregue).** *Comprovado no código. A regra precisa ser confirmada.*
1. Depois da baixa, um void ou mudança no QB só grava `issues`. A devolução física vira ajuste manual "Return", desligado da invoice e com efeito de custo.
2. **Regra a definir:** devolução vinculada à invoice/delivery, entrando pelo custo da saída original (`unitCost` da transação `SOLD`). Garantia: troca (sai uma unidade nova, volta uma defeituosa para "indisponível"?) ou só registro.
3. `ingest.ts:283-294` e `:331-359`; `service.ts:478-483`.
4. Divergência entre o QB e o estoque sem caminho para resolver; custo distorcido nas devoluções.
5. Nenhum.
6. Ação "Registrar devolução" na invoice (`RETURNED` +qtd, `unitCost` = custo da saída, `metadata.orderId/deliveryId`) e ação "Marcar revisado" para `issues`.
7. Devolução de 1 un → físico +1, média inalterada se o custo for igual, vínculo à invoice.
8. P1-5.

### P2: médio

| # | Achado | Evidência | Correção sugerida |
|---|---|---|---|
| P2-1 | Excluir um produto apaga todas as suas transações e o `CostHistory`. Só é bloqueado se houver linha de invoice. | `service.ts:350-376` | Bloquear a exclusão quando houver movimentos (ou arquivar com `archivedAt`) |
| P2-2 | Ajustes sem idempotência no servidor; a proteção de duplo clique é só `busy.current` no cliente. Um retry ou timeout duplica o ajuste. | `ProductDialog.tsx:1480-1500`; `api/adjustments` | Chave de idempotência (`requestId` único em `metadata` ou coluna) |
| P2-3 | `upsertImportation` aceita `status` no corpo do `save`. Uma chamada direta pode marcar COMPLETED **sem** somar estoque, e um reabrir posterior subtrairia unidades que nunca entraram. A UI não envia esse campo. | `api/importations/route.ts:57-72`; `service.ts:603-611` | Ignorar `status: COMPLETED` no save; só `setImportStatus` conclui |
| P2-4 | Sem validação de valores. Uma quantidade negativa numa linha de importação vira uma **saída** do tipo IMPORTATION. Um ajuste sem `quantity`/`mode` válidos (como o que `scripts/smoke.mjs` envia) passa pelo check `quantity <= 0` (`undefined <= 0` é falso), e o delta vira `NaN`. `NaN < 0` também é falso, então **`NaN` é gravado em `physicalQty`**. Preços negativos ou `NaN` também são aceitos. Só usuários com edição chegam lá, mas o efeito é de P0. | `upsertImportation`; `changeQuantity` (`service.ts:474-476`); `appendTransaction` (`:101-104`) | Validar `Number.isFinite`, `quantity > 0`, `cost ≥ 0` e `mode` nas rotas e em `appendTransaction` |
| P2-5 | Produto casado por nome exato ou por número no início do nome. Uma linha de QB pode cair no produto errado. A linha `physical` é decidida por regex no nome ("service", "fee"…). | `ingest.ts:129-152`; `delivery-rules.ts:35` | Casar só por item QB/SKU e listar o resto como "não casado" |
| P2-6 | `releaseOrder`, `changeReserved` e `ingest` usam `max(0, …)` em `reservedQty`, escondendo deriva. Não existe reconciliação. | `orders.ts:156`; `ingest.ts:300`, `:431`, `:446` | Relatório somente-leitura: `Product.reservedQty` vs Σ`OrderLine.reservedQty` |
| P2-7 | Log de ajuste não guarda os valores antes/depois (só o delta). `CostHistory` só existe para entradas com custo. | `appendTransaction` | Gravar `before`/`after` de qtd/média/valor em `metadata` |
| P2-8 | Confirmar uma linha sem produto cria um produto novo pelo nome, sem checar duplicata. | `service.ts:809-821` | Exigir produto ou checar nome/SKU |
| P2-9 | `applyImport` (planilha) confia no `preview` (com `existingId`) enviado pelo cliente. | `api/import-export/route.ts` | Refazer o preview no servidor ao confirmar |
| P2-10 | Importação concluída por arraste no kanban e "Undo" disparam movimentos de estoque com um gesto. O arraste não tem confirmação e as chamadas não são serializadas. | `ImportsTab.tsx:423-480` | Confirmação explícita para concluir/reabrir; desabilitar o card durante a requisição |

### P3: baixo

- **Campos legados nunca escritos:** `waitingPickupQty`, `waitingDeliveryQty`, `unavailableQty`, `OrderLine.pickedQty/waitingPickupQty/scannedQty`, legados do `Order`. As checagens `scannedQty` em `ingest.ts` são sempre falsas.
- **Código morto:** componentes `Inventory*`/`*Modal` e o stub do adapter; tipos de transação sem uso.
- **`QbSyncEvent`** guarda todo payload e cresce sem limite; `processed` nunca é usado.
- **Dinheiro e quantidades em `Float`**, com arredondamento a 4 casas em JS. Avaliar `Decimal` no futuro.
- **`applyOverdueDelays` escreve no banco dentro de um GET**, e o fuso é UTC.
- **`scripts/smoke.mjs`** está quebrado (contrato antigo). Não há script `test`.

### Hipóteses a validar (somente leitura, com autorização)

1. **Reservas consistentes:**
   ```sql
   SELECT p.code, p."reservedQty", COALESCE(SUM(l."reservedQty"),0) AS linhas
   FROM "Product" p LEFT JOIN "OrderLine" l ON l."productId" = p.id GROUP BY p.id HAVING p."reservedQty" <> COALESCE(SUM(l."reservedQty"),0);
   ```
2. **Físico igual à soma dos movimentos.** Esperado: igual, salvo onde P0-2 ocorreu.
   ```sql
   SELECT p.code, p."physicalQty", SUM(t.quantity) FROM "Product" p JOIN "InventoryTransaction" t ON t."productId"=p.id GROUP BY p.id HAVING p."physicalQty" <> SUM(t.quantity);
   ```
3. **Disponível negativo, ou disponível ≠ físico − reservado:**
   ```sql
   SELECT code FROM "Product" WHERE "availableQty" < 0 OR "availableQty" <> "physicalQty" - "reservedQty";
   ```
4. **Importações reabertas** (concluídas antes e hoje sem transação). Comparar `Importation` com status ≠ COMPLETED e `updatedAt` > `createdAt` contra os logs. Como o histórico é apagado, só dá para inferir.
5. **Produtos com custo 0 e estoque > 0:** ver a consulta da seção 2.
6. **Webhook ativo** (`QB_WEBHOOK_VERIFIER` definida na Vercel) e **duração real do sync**, a partir de `qbSyncAt`/`qbSyncedAt` ou dos logs da Vercel.

---

## 7. Sequência de implementação proposta

| Etapa | Conteúdo | Depende de | Observação |
|---|---|---|---|
| 0 | P0-5 (guarda no seed) e base de testes de integração no banco descartável (script `test`) | — | Sem risco; destrava o resto |
| 1 | Relatório de reconciliação **somente leitura** (hipóteses 1–5) rodado em produção com sua autorização | 0 | Mostra o tamanho do estrago antes de mexer |
| 2 | P0-1 e P0-2: locks e idempotência em concluir/reabrir importação | 0 | Mudança local, sem migração |
| 3 | P0-3: estorno por transação reversa, sem apagar histórico | 2 | Pode exigir um novo valor no enum `TransactionType` (migração aditiva) |
| 4 | P1-7 (ator real) e P2-7 (antes/depois no log) | 0 | Melhora a rastreabilidade de tudo que vem depois |
| 5 | P1-5: separar ajuste de quantidade de ajuste de custo | 3, 4 | |
| 6 | P1-6 + P0-4: data efetiva e importação histórica "só custo"; depois, reconstrução da base de custo (P1-3) com prévia e aprovação produto a produto | 3, 5, **regra definida** | Nunca altera o físico |
| 7 | P1-1, P1-2 e P1-4: lock por Order no `ingestInvoice`, trava de sync com lease, casamento por linha QB | 0 | Pré-requisito da tarefa de sincronização de invoices |
| 8 | P1-8 e P1-9: regras de reserva/backorder e fluxo de devolução/garantia | 5, 7, **regras definidas** | |
| 9 | P2 restantes, depois P3. Só então mídia, catálogo e pesquisa. | — | |

### Regras que precisam da sua decisão antes da etapa 6 em diante

1. **Importação histórica:**
   - Qual método de custo base: média ponderada de todas as importações aplicada ao físico atual (opção a), ou outro?
   - O que fazer com produtos sem nenhuma importação registrada?
2. **"CIF":** manter o nome para o custo *landed* (com duties, frete interno etc.) ou renomear para "Landed"?
3. **FOB e moeda:** o FOB é sempre em USD? Deve ser a última compra ou uma média?
4. **Reserva acima do disponível:** permitir (backorder), avisar ou bloquear?
5. **Devolução:** a que custo a unidade volta: o custo da saída original, ou o médio atual?
6. **Garantia:**
   - A unidade defeituosa volta como "indisponível" (usando `unavailableQty`) ou não volta?
   - A troca gera saída sem venda?
7. **Correção de custo manual:** quem pode fazer? Motivo obrigatório?
8. **Fotos no recebimento:** são obrigatórias? Hoje não existem.

---

## 8. Plano de testes de regressão

**Infraestrutura**
- Script `npm test`, rodando os `*.test.ts` existentes mais testes de integração contra o banco descartável (`prisma dev`, nunca o `.env`), recriado por teste.
- O guarda de P0-5 vale também para os testes.

**Unitários (puros)**
- `calcWeightedAverageCost`: entrada em estoque zero, entrada com custo 0, arredondamento.
- `allocateAdditionalCosts`: a soma do rateio é igual ao total; subtotal 0.
- Estorno de custo (etapa 3): entrada seguida de estorno restaura média e valor exatos.

**Integração: importação**
1. Concluir → físico +q, média ponderada correta, 1 transação + 1 `CostHistory`.
2. Concluir duas vezes, em série e em paralelo → efeito único.
3. Reabrir sem vendas → físico, valor e média exatamente como antes; histórico preservado com a transação reversa.
4. Reabrir depois de vender parte → recusa com mensagem.
5. Reabrir duas vezes em paralelo → efeito único.
6. Importação histórica → físico inalterado, média = esperado, `CostHistory.occurredAt` = data informada.
7. Save com `status: COMPLETED` → ignorado.

**Integração: ajustes**
1. Ajuste de quantidade ± → média, CIF e FOB inalterados; `userId` = ator; antes/depois em `metadata`.
2. Ajuste de custo → quantidade inalterada.
3. Mesma chave de idempotência duas vezes → um lançamento.
4. Valores inválidos → 400.

**Integração: entregas**
1. Add to workflow → reservado +q, disponível −q; repetir → sem efeito.
2. Completar → físico −q, reservado −q, 1 `SOLD`; completar de novo ou em paralelo → efeito único.
3. Split + completar as duas deliveries → total baixado = q.
4. `stockStage` = ready/out/completed → baixa no estágio certo; voltar de estágio após a baixa → recusado.
5. Back to New → reserva zerada.

**Integração: QuickBooks** (com payloads de `QbSyncEvent` anonimizados como fixtures)
1. Invoice nova → Order sem reserva.
2. Mudança de quantidade no workflow → reserva +delta, uma vez, mesmo com duas ingestões em paralelo.
3. Mesmo item em duas linhas → quantidades corretas.
4. Void antes da baixa → reserva liberada, deliveries removidas, tudo atômico.
5. Void ou mudança depois da baixa → estoque intacto, `issues` gravado.
6. `ingestInvoice` em paralelo com `addToWorkflow` → nenhuma reserva órfã.

**Invariantes verificadas ao fim de cada teste**
- `físico = Σ transações.quantity`.
- `reservado = Σ OrderLine.reservedQty`.
- `disponível = físico − reservado`.
- `valor ≈ físico × média`.
- `físico ≥ 0`.

O relatório da etapa 1 roda exatamente essas invariantes em produção (somente leitura).

---

**Conclusão:** diagnóstico concluído. Aguardo sua revisão das prioridades e das regras listadas na seção 7 antes de qualquer alteração de código.

---

## Status da Fase 2 (21/10/2026)

**Decisões tomadas**
- **Custo base:** média ponderada de todas as importações concluídas (históricas e normais), aplicada ao físico atual.
- **Reserva acima do disponível:** avisar e bloquear.
- **Devolução e garantia:** adiadas; virão como funcionalidade nova.
- **Nome "CIF":** mantido.

**Aplicado e testado** (`npm test`, `npm run test:db` no banco descartável)

| Achado | O que foi feito |
|---|---|
| P0-1, P0-2 | Importação travada (`FOR UPDATE`) em concluir, reabrir, salvar e excluir |
| P0-3 | Reabrir lança um estorno (sem apagar histórico) e restaura exatamente físico, média, FOB e CIF. Se o produto movimentou desde o recebimento, recusa e orienta para os ajustes. |
| P0-4, P1-6 | Importação "Historical" (só custo) e campo "Received on" (data efetiva) |
| P0-5 | Seed e reset só rodam em banco local |
| P1-1, P1-2 | Ingestão do QuickBooks sob lock da invoice; trava do sync vale durante a execução inteira |
| P1-3 | Estoque inicial sem custo conhecido não vira entrada a $0 |
| P1-4 | Linhas casadas pelo id da linha do QuickBooks |
| P1-5 | Ajuste de quantidade não mexe em custo; nova correção de custo (aba "Cost") |
| P1-7 | Movimentos registram o usuário real |
| P1-8 | Invoice só entra no workflow com estoque disponível; o painel avisa a falta antes. Mudança vinda do QB que estoura o disponível vira aviso em `issues`. |
| P2-2 | Ajuste idempotente (`requestId`) |
| P2-3 | O save não conclui importação |
| P2-4 | Validação de números |
| P2-7 | Antes/depois no log |
| — | `scripts/reconcile.mts` (somente leitura) |

**Pendente:** P1-9 (devolução/garantia), P2-1, P2-5, P2-6 (o relatório existe; falta a correção), P2-8, P2-9, P2-10, P3.

## Fase 2, segunda parte (22/10/2026)

**Decisões**
- A invoice sempre espelha o QuickBooks; o estoque só se move com fato físico.
- Aumento depois da saída vira nova entrega reservada. Redução ou void depois da saída marca "Awaiting return".
- Devolução com condição física: em bom estado volta ao disponível; danificada fica separada (`unavailableQty`), com ações de liberar ou dar baixa.
- Garantia: adiada.
- Importação histórica não exige foto.

**Feito**

| Tema | O que foi feito |
|---|---|
| Recebimento | Modal com a data de chegada (preenchida com hoje, editável) e foto obrigatória. Data, fotos e estoque gravados numa única transação. A ETA é preservada; reabrir limpa `receivedAt`. |
| Sincronização com o QB | Linhas sempre sincronizadas, inclusive depois da saída. Reserva = unidades das entregas que ainda não saíram (`reserveOpenDeliveries`). |
| Disponível | Físico − reservado − separado |
| Permissões | Teste HTTP (`scripts/permissions.test.mts`) |
| Erros | Respostas de erro não expõem mais internos do banco |
| Uploads | O descarte de uploads não apaga mais fotos-comprovante |
| Reconciliação | Ampliada |
| P1-9 | Devolução: feita. Garantia: adiada. |

**Migração:** `20261022120000_receipts_returns` (aditiva: tabela `ImportationProof` e `OrderLine.returnedQty`).

## Fase 3: custos (23/10/2026)

**Fórmulas** (em `src/lib/inventory/math.ts`, usadas igualmente pela tela e pelo servidor)

| Grandeza | Fórmula |
|---|---|
| Valor de compra da linha | qtd × Cost (FOB unitário, US$; não há conversão de moeda) |
| Tax da linha | valor de compra × Tax% (fica no próprio produto) |
| Rateio da linha | adicionais do lote (Transfer, Freight, Delivery, Duties, Customs, Other) × valor da linha ÷ valor de todas as linhas |
| CIF unitário | (valor de compra + Tax + rateio) ÷ qtd |
| Coef da linha | CIF ÷ Cost |
| Coef da importação | custo total ÷ valor de compra |
| FOB do produto | Cost da última importação normal recebida. Corrigível à mão. Não entra na média. |
| CIF do produto | CIF unitário da última importação normal recebida |

**Custo médio**
- Recebimento normal: média móvel. Valor += qtd × CIF; média = valor ÷ físico.
- Importação histórica, ou correção de custos de uma importação recebida: base = Σ(qtd × CIF) ÷ Σ qtd de todos os lotes recebidos (históricos e normais), aplicada ao físico atual sem mudar unidades. Exemplo: 100 a US$10 + 200 a US$15 → US$13,33.
- Produto sem nenhuma importação: a média não é inventada e o produto aparece em "Units on hand with no cost".

**Feito**
- Coluna Tax (%) por linha.
- Coef ao lado do progresso.
- Valores com centavos e somas/subtrações simples ("120+13").
- Correção de importação recebida: só o usuário principal, só custos, motivo obrigatório. Fica registrada com valores antes e depois em `ImportationEvent` e recalcula a base de custo.
- Correção de FOB pela tabela e pelo card.

**Migração:** `20261023120000_import_tax_events` (aditiva).
