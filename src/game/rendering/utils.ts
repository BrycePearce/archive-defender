export function colorWithAlpha(color: string, alpha: number) {
  if (color.startsWith("#") && color.length === 7) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return color;
}

export function clampRender(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
