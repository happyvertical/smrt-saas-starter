export function readableMetricLabel(metricKey: string): string {
  return metricKey
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function usageMetricUnit(metricKey: string): string {
  if (metricKey.includes("tokens")) {
    return "tokens";
  }
  if (metricKey.includes("cost")) {
    return "USD";
  }
  if (metricKey.includes("messages")) {
    return "messages";
  }
  if (metricKey.includes("calls")) {
    return "calls";
  }
  return "units";
}
