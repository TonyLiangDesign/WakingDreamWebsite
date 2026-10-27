// Tangent-space normals from a periodic height field. The generated heights and strengths
// are bounded, so a direct square root avoids Math.hypot's overflow-rescaling overhead.
export function writeNormalPixels(height, width, rows, strength, pixels) {
  for (let y = 0; y < rows; y++) {
    const row = y * width;
    const above = (y + 1 === rows ? 0 : y + 1) * width;
    const below = (y === 0 ? rows - 1 : y - 1) * width;
    for (let x = 0; x < width; x++) {
      const dx = height[row + (x + 1 === width ? 0 : x + 1)] - height[row + (x === 0 ? width - 1 : x - 1)];
      const dy = height[above + x] - height[below + x];
      const nx = -dx * strength, ny = dy * strength;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) * 4;
      pixels[i] = (nx / length * 0.5 + 0.5) * 255;
      pixels[i + 1] = (ny / length * 0.5 + 0.5) * 255;
      pixels[i + 2] = (1 / length * 0.5 + 0.5) * 255;
      pixels[i + 3] = 255;
    }
  }
}
