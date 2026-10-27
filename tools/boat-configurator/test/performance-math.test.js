import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { hullPoints } from '../src/framing.js';
import { writeNormalPixels } from '../src/normal-pixels.js';

const random = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test('normal pixels preserve the original height derivative, orientation and wrapping', () => {
  const next = random(42);
  for (const [w, h] of [[1, 1], [1, 17], [19, 1], [17, 23], [2048, 256]]) {
    const height = Float32Array.from({ length: w * h }, next);
    const actual = new Uint8ClampedArray(w * h * 4), expected = actual.slice();
    const strength = 3.52;
    writeNormalPixels(height, w, h, strength, actual);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = -(height[y * w + ((x + 1) % w)] - height[y * w + ((x - 1 + w) % w)]) * strength;
      const ny = (height[((y + 1) % h) * w + x] - height[((y - 1 + h) % h) * w + x]) * strength;
      const l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      expected[i] = (nx / l * 0.5 + 0.5) * 255;
      expected[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      expected[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      expected[i + 3] = 255;
    }
    assert.deepEqual(actual, expected);
  }
});

for (const shape of ['volume', 'plane', 'line', 'point']) {
  test(`framing support projections match exhaustive searches for ${shape}`, () => {
    const next = random(73);
    const points = Array.from({ length: 2500 }, () => {
      const x = next() * 7, y = next() * 3, z = next() * 2;
      if (shape === 'point') return new Vector3(2, 3, 4);
      if (shape === 'line') return new Vector3(x, x * 2, -x);
      if (shape === 'plane') return new Vector3(x, y, x + y);
      return new Vector3(x, y, z);
    });
    const centre = new Vector3(1, 0.8, -2);
    const support = hullPoints(points, centre);
    assert.ok(support.length <= 400);
    for (let i = 0; i < 400; i++) {
      const y = 1 - 2 * (i + 0.5) / 400, r = Math.sqrt(1 - y * y);
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const direction = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      const max = (list) => list.reduce((best, p) => Math.max(best, p.dot(direction)), -Infinity);
      assert.ok(Math.abs(max(points) - max(support)) < 1e-9);
    }
  });
}
