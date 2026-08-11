const base = "http://localhost:3000";

async function main() {
  const products = await fetch(`${base}/api/products?q=PAR-M8-50`).then((r) =>
    r.json(),
  );
  const product = products[0];
  console.log("product", product.sku, "avg", product.avgCost, "qty", product.physicalQty);

  const adj = await fetch(`${base}/api/adjustments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: product.id,
      quantityDelta: -1,
      reason: "Dano no transporte",
    }),
  }).then((r) => r.json());
  console.log("adjust", adj.type || adj.error, adj.quantity);

  const order = await fetch(`${base}/api/orders?ref=NF-1024`).then((r) =>
    r.json(),
  );
  const pick = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "pick",
      orderId: order.id,
      productId: product.id,
      quantity: 2,
    }),
  }).then((r) => r.json());
  console.log(
    "pick",
    pick.status,
    pick.lines?.map((l) => ({
      sku: l.product.sku,
      picked: l.pickedQty,
    })),
  );

  const recv = await fetch(`${base}/api/importations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reference: "IMP-TEST-99",
      confirm: true,
      freightIntl: 100,
      lines: [
        { productId: product.id, quantity: 5, purchaseUnitCost: 18 },
      ],
    }),
  }).then((r) => r.json());
  console.log(
    "receive",
    recv.status,
    recv.reference,
    recv.lines?.[0]?.landedUnitCost,
  );

  const updated = await fetch(`${base}/api/products/${product.id}`).then((r) =>
    r.json(),
  );
  console.log(
    "updated",
    updated.physicalQty,
    updated.avgCost,
    updated.availableQty,
    updated.waitingPickupQty,
    updated.costHistory?.length,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
