"use strict";

const zlib = require("zlib");

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

// Encodes an RGBA buffer as an 8-bit truecolor-with-alpha PNG (filter 0).
function encodePng({ width, height, rgba }) {
  if (!width || !height || !rgba || rgba.length < width * height * 4) {
    throw new Error("encodePng requires width, height, and an RGBA buffer");
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function cropRgba(image, rect) {
  const out = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const sourceStart = ((rect.y + y) * image.width + rect.x) * 4;
    image.rgba.copy(out, y * rect.width * 4, sourceStart, sourceStart + rect.width * 4);
  }
  return { width: rect.width, height: rect.height, rgba: out };
}

// Bilinear resize on alpha-premultiplied values so transparent gutters do not
// bleed dark halos into the edges.
function resizeRgba(image, targetWidth, targetHeight) {
  const { width, height, rgba } = image;
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = targetHeight === 1 ? 0 : (y / (targetHeight - 1)) * (height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, height - 1);
    const fy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = targetWidth === 1 ? 0 : (x / (targetWidth - 1)) * (width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, width - 1);
      const fx = sx - x0;
      const offsets = [
        (y0 * width + x0) * 4,
        (y0 * width + x1) * 4,
        (y1 * width + x0) * 4,
        (y1 * width + x1) * 4
      ];
      const weights = [
        (1 - fx) * (1 - fy),
        fx * (1 - fy),
        (1 - fx) * fy,
        fx * fy
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = 0; i < 4; i += 1) {
        const alpha = rgba[offsets[i] + 3] / 255;
        const weight = weights[i];
        r += rgba[offsets[i]] * alpha * weight;
        g += rgba[offsets[i] + 1] * alpha * weight;
        b += rgba[offsets[i] + 2] * alpha * weight;
        a += alpha * weight;
      }
      const outOffset = (y * targetWidth + x) * 4;
      if (a > 0) {
        out[outOffset] = Math.round(r / a);
        out[outOffset + 1] = Math.round(g / a);
        out[outOffset + 2] = Math.round(b / a);
      }
      out[outOffset + 3] = Math.round(a * 255);
    }
  }
  return { width: targetWidth, height: targetHeight, rgba: out };
}

function alphaBounds(image, threshold = 8) {
  const { width, height, rgba } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) {
    return null;
  }
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1
  };
}

// Uniform-fits an image into a target canvas and centers it, preserving the
// glyph aspect ratio (for icons and decorative pieces).
function fitRgba(image, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
  const fitWidth = Math.max(1, Math.round(image.width * scale));
  const fitHeight = Math.max(1, Math.round(image.height * scale));
  const scaled = resizeRgba(image, fitWidth, fitHeight);
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  const offsetX = Math.floor((targetWidth - fitWidth) / 2);
  const offsetY = Math.floor((targetHeight - fitHeight) / 2);
  for (let y = 0; y < fitHeight; y += 1) {
    scaled.rgba.copy(
      out,
      ((offsetY + y) * targetWidth + offsetX) * 4,
      y * fitWidth * 4,
      (y + 1) * fitWidth * 4
    );
  }
  return { width: targetWidth, height: targetHeight, rgba: out };
}

module.exports = {
  alphaBounds,
  cropRgba,
  encodePng,
  fitRgba,
  resizeRgba
};
