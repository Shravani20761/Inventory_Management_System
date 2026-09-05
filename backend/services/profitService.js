export function calculateProfit({ purchaseRate = 0, sellingRate = 0, quantity = 1 }) {
  const cost = Number(purchaseRate) || 0;
  const price = Number(sellingRate) || 0;
  const units = Number(quantity) || 1;
  const profitPerUnit = price - cost;
  const profit = profitPerUnit * units;
  const marginPercentage = cost > 0 ? (profitPerUnit / cost) * 100 : 0;

  return {
    purchaseRate: cost,
    sellingRate: price,
    quantity: units,
    profit,
    loss: profit < 0 ? Math.abs(profit) : 0,
    marginPercentage: Number(marginPercentage.toFixed(2)),
    status: profit < 0 ? "loss" : profit > 0 ? "profit" : "break-even",
    alert:
      profit < 0
        ? `Loss Rs ${Math.abs(profit).toLocaleString("en-IN")}`
        : `Profit Rs ${profit.toLocaleString("en-IN")}`,
  };
}

export function enrichProductProfit(product) {
  const sellingRate = product.sellingRate ?? product.sellRate ?? product.newRateWithOB ?? 0;
  const purchaseRate =
    product.purchaseRate ?? product.dp ?? product.dpPrice ?? product.dpPlusGst ?? 0;
  return {
    ...product,
    sellingRate,
    purchaseRate,
    profitAnalysis: calculateProfit({
      purchaseRate,
      sellingRate,
      quantity: 1,
    }),
  };
}

export function buildProfitLog(product, quantity = 1, date = new Date()) {
  const sellingRate = product.sellingRate ?? product.sellRate ?? 0;
  const analysis = calculateProfit({
    purchaseRate: product.purchaseRate,
    sellingRate,
    quantity,
  });

  return {
    id: `PL-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    productId: product.id ?? product._id,
    modelName: product.modelName ?? product.model,
    purchaseRate: analysis.purchaseRate,
    sellingRate: analysis.sellingRate,
    quantity: analysis.quantity,
    profit: analysis.profit > 0 ? analysis.profit : 0,
    loss: analysis.loss,
    marginPercentage: analysis.marginPercentage,
    date: date.toISOString(),
  };
}
