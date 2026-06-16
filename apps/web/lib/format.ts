export function formatNumber(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  return value.toLocaleString("zh-CN");
}

export function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`;
}
