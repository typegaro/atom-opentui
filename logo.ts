export function createStartupLogo(width: number, height: number, fillPercent: number): string[] {
  const lines: string[] = [];

  for (let y = 0; y < height; y++) {
    const cells = new Array<boolean>(width).fill(false);
    const halfWidth = Math.floor((width + 1) / 2);

    for (let x = 0; x < halfWidth; x++) {
      const mirrorX = width - 1 - x;
      const pixelOn = isInsideEllipse(x, y, width, height)
        && (isOutlineCell(x, y, width, height)
          || isOutlineCell(mirrorX, y, width, height)
          || Math.random() * 100 < fillPercent);
      cells[x] = pixelOn;
      cells[mirrorX] = pixelOn;
    }

    lines.push(cells.map((cell) => cell ? "█" : " ").join(""));
  }

  return lines;
}

function isInsideEllipse(x: number, y: number, width: number, height: number): boolean {
  const cx = (width - 1) / 2.0;
  const cy = (height - 1) / 2.0;
  const rx = Math.max(width / 2.0 - 1.0, 1.0);
  const ry = Math.max(height / 2.0 - 1.0, 1.0);
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1.0;
}

function isOutlineCell(x: number, y: number, width: number, height: number): boolean {
  if (!isInsideEllipse(x, y, width, height)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isInsideEllipse(x + dx, y + dy, width, height));
}
