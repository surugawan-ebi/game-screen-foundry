"use strict";

const fs = require("fs");
const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function assertPng(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function bytesPerPixel(colorType, bitDepth) {
  if (colorType === 6) {
    return Math.max(1, Math.ceil((4 * bitDepth) / 8));
  }
  if (colorType === 2) {
    return Math.max(1, Math.ceil((3 * bitDepth) / 8));
  }
  if (colorType === 4) {
    return Math.max(1, Math.ceil((2 * bitDepth) / 8));
  }
  return 1;
}

function bitsPerPixel(colorType, bitDepth) {
  if (colorType === 6) {
    return 4 * bitDepth;
  }
  if (colorType === 2) {
    return 3 * bitDepth;
  }
  if (colorType === 4) {
    return 2 * bitDepth;
  }
  return bitDepth;
}

function readPngChunks(buffer) {
  assertPng(buffer.length >= PNG_SIGNATURE.length, "PNG is too small");
  assertPng(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), "File is not a PNG");

  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assertPng(dataEnd + 4 <= buffer.length, `PNG chunk ${type} exceeds file length`);
    chunks.push({
      type,
      data: buffer.subarray(dataStart, dataEnd)
    });
    offset = dataEnd + 4;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
}

function unpackIndexedSample(row, index, bitDepth) {
  if (bitDepth === 8) {
    return row[index];
  }
  const samplesPerByte = 8 / bitDepth;
  const byte = row[Math.floor(index / samplesPerByte)];
  const shift = 8 - bitDepth - (index % samplesPerByte) * bitDepth;
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function scaleSample(value, bitDepth) {
  if (bitDepth === 8) {
    return value;
  }
  if (bitDepth === 16) {
    return value >> 8;
  }
  const max = (1 << bitDepth) - 1;
  return Math.round((value / max) * 255);
}

function readSample(row, byteOffset, bitDepth) {
  if (bitDepth === 16) {
    return row.readUInt16BE(byteOffset);
  }
  return row[byteOffset];
}

function decodePixel(row, x, meta) {
  const { bitDepth, colorType, palette, transparency } = meta;
  if (colorType === 6) {
    const offset = x * (bitDepth === 16 ? 8 : 4);
    return [
      scaleSample(readSample(row, offset, bitDepth), bitDepth),
      scaleSample(readSample(row, offset + (bitDepth === 16 ? 2 : 1), bitDepth), bitDepth),
      scaleSample(readSample(row, offset + (bitDepth === 16 ? 4 : 2), bitDepth), bitDepth),
      scaleSample(readSample(row, offset + (bitDepth === 16 ? 6 : 3), bitDepth), bitDepth)
    ];
  }
  if (colorType === 2) {
    const offset = x * (bitDepth === 16 ? 6 : 3);
    const red = readSample(row, offset, bitDepth);
    const green = readSample(row, offset + (bitDepth === 16 ? 2 : 1), bitDepth);
    const blue = readSample(row, offset + (bitDepth === 16 ? 4 : 2), bitDepth);
    const alpha = transparency
      && red === transparency.red
      && green === transparency.green
      && blue === transparency.blue
      ? 0
      : 255;
    return [
      scaleSample(red, bitDepth),
      scaleSample(green, bitDepth),
      scaleSample(blue, bitDepth),
      alpha
    ];
  }
  if (colorType === 4) {
    const offset = x * (bitDepth === 16 ? 4 : 2);
    const gray = scaleSample(readSample(row, offset, bitDepth), bitDepth);
    const alpha = scaleSample(readSample(row, offset + (bitDepth === 16 ? 2 : 1), bitDepth), bitDepth);
    return [gray, gray, gray, alpha];
  }
  if (colorType === 3) {
    const paletteIndex = unpackIndexedSample(row, x, bitDepth);
    const paletteOffset = paletteIndex * 3;
    const alpha = transparency && transparency.paletteAlpha && transparency.paletteAlpha[paletteIndex] !== undefined
      ? transparency.paletteAlpha[paletteIndex]
      : 255;
    return [
      palette[paletteOffset] || 0,
      palette[paletteOffset + 1] || 0,
      palette[paletteOffset + 2] || 0,
      alpha
    ];
  }
  if (colorType === 0) {
    const gray = bitDepth < 8
      ? scaleSample(unpackIndexedSample(row, x, bitDepth), bitDepth)
      : scaleSample(readSample(row, x * (bitDepth === 16 ? 2 : 1), bitDepth), bitDepth);
    const rawGray = bitDepth < 8
      ? unpackIndexedSample(row, x, bitDepth)
      : readSample(row, x * (bitDepth === 16 ? 2 : 1), bitDepth);
    const alpha = transparency && rawGray === transparency.gray ? 0 : 255;
    return [gray, gray, gray, alpha];
  }
  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function parseTransparency(data, colorType) {
  if (!data || !data.length) {
    return null;
  }
  if (colorType === 3) {
    return {
      paletteAlpha: [...data]
    };
  }
  if (colorType === 0 && data.length >= 2) {
    return {
      gray: data.readUInt16BE(0)
    };
  }
  if (colorType === 2 && data.length >= 6) {
    return {
      red: data.readUInt16BE(0),
      green: data.readUInt16BE(2),
      blue: data.readUInt16BE(4)
    };
  }
  return null;
}

function parsePng(buffer, { maxPixels = 12000000 } = {}) {
  const chunks = readPngChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  assertPng(ihdr && ihdr.data.length === 13, "PNG missing IHDR");

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const compression = ihdr.data[10];
  const filter = ihdr.data[11];
  const interlace = ihdr.data[12];
  assertPng(width > 0 && height > 0, "PNG dimensions must be positive");
  assertPng(width * height <= maxPixels, `PNG is too large to inspect: ${width}x${height}`);
  assertPng(compression === 0 && filter === 0, "Unsupported PNG compression or filter method");
  assertPng(interlace === 0, "Interlaced PNGs are not supported by the local inspector");
  assertPng([0, 2, 3, 4, 6].includes(colorType), `Unsupported PNG color type: ${colorType}`);
  assertPng([1, 2, 4, 8, 16].includes(bitDepth), `Unsupported PNG bit depth: ${bitDepth}`);
  if ([2, 4, 6].includes(colorType)) {
    assertPng(bitDepth === 8 || bitDepth === 16, `Unsupported bit depth ${bitDepth} for color type ${colorType}`);
  }

  const paletteChunk = chunks.find((chunk) => chunk.type === "PLTE");
  const transparencyChunk = chunks.find((chunk) => chunk.type === "tRNS");
  const palette = paletteChunk ? paletteChunk.data : Buffer.alloc(0);
  if (colorType === 3) {
    assertPng(palette.length >= 3, "Indexed PNG missing palette");
  }

  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  assertPng(idat.length > 0, "PNG missing IDAT");
  const inflated = zlib.inflateSync(idat);
  const rowBytes = Math.ceil((width * bitsPerPixel(colorType, bitDepth)) / 8);
  const rgba = Buffer.alloc(width * height * 4);
  const bpp = bytesPerPixel(colorType, bitDepth);
  const previous = Buffer.alloc(rowBytes);
  const meta = {
    bitDepth,
    colorType,
    palette,
    transparency: parseTransparency(transparencyChunk && transparencyChunk.data, colorType)
  };

  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[offset];
    offset += 1;
    const raw = Buffer.from(inflated.subarray(offset, offset + rowBytes));
    offset += rowBytes;
    assertPng(raw.length === rowBytes, "PNG row data is truncated");

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bpp ? raw[x - bpp] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bpp ? previous[x - bpp] || 0 : 0;
      if (filterType === 1) {
        raw[x] = (raw[x] + left) & 0xff;
      } else if (filterType === 2) {
        raw[x] = (raw[x] + up) & 0xff;
      } else if (filterType === 3) {
        raw[x] = (raw[x] + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        raw[x] = (raw[x] + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        assertPng(filterType === 0, `Unsupported PNG row filter: ${filterType}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const pixel = decodePixel(raw, x, meta);
      const outputOffset = (y * width + x) * 4;
      rgba[outputOffset] = pixel[0];
      rgba[outputOffset + 1] = pixel[1];
      rgba[outputOffset + 2] = pixel[2];
      rgba[outputOffset + 3] = pixel[3];
    }
    raw.copy(previous);
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    rgba
  };
}

function luminance(rgba, offset) {
  return (rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722) / 255;
}

function zoneForPixel(x, y, width, height) {
  const centerLeft = width * 0.24;
  const centerRight = width * 0.76;
  const centerTop = height * 0.24;
  const centerBottom = height * 0.76;
  if (x >= centerLeft && x <= centerRight && y >= centerTop && y <= centerBottom) {
    return "center";
  }
  return "perimeter";
}

function emptyDetailBucket() {
  return {
    gradient: 0,
    comparisons: 0,
    alpha: 0,
    pixels: 0
  };
}

function clampRatio(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function analyzePngData(parsed, options = {}) {
  const { width, height, rgba } = parsed;
  const alphaThreshold = Number.isFinite(options.alphaThreshold) ? options.alphaThreshold : 8;
  const edgeBand = Math.max(1, Math.min(12, Math.round(Math.min(width, height) * 0.035)));
  const step = Math.max(1, Math.floor(Math.max(width, height) / 256));
  const details = {
    center: emptyDetailBucket(),
    perimeter: emptyDetailBucket()
  };
  const colors = new Set();
  let opaquePixels = 0;
  let semiTransparentPixels = 0;
  let fullyTransparentPixels = 0;
  let edgePixels = 0;
  let edgeAlphaPixels = 0;
  let edgeSemiTransparentPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = rgba[offset + 3];
      if (alpha > alphaThreshold) {
        opaquePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        const red = rgba[offset] >> 4;
        const green = rgba[offset + 1] >> 4;
        const blue = rgba[offset + 2] >> 4;
        colors.add(`${red}${green}${blue}`);
      } else {
        fullyTransparentPixels += 1;
      }
      if (alpha > 0 && alpha < 250) {
        semiTransparentPixels += 1;
      }
      if (x < edgeBand || y < edgeBand || x >= width - edgeBand || y >= height - edgeBand) {
        edgePixels += 1;
        if (alpha > alphaThreshold) {
          edgeAlphaPixels += 1;
        }
        if (alpha > 0 && alpha < 250) {
          edgeSemiTransparentPixels += 1;
        }
      }
    }
  }

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      if (rgba[offset + 3] <= alphaThreshold) {
        continue;
      }
      const zone = zoneForPixel(x, y, width, height);
      const bucket = details[zone];
      bucket.alpha += rgba[offset + 3] / 255;
      bucket.pixels += 1;
      const current = luminance(rgba, offset);
      if (x + step < width) {
        const rightOffset = (y * width + x + step) * 4;
        if (rgba[rightOffset + 3] > alphaThreshold) {
          bucket.gradient += Math.abs(current - luminance(rgba, rightOffset));
          bucket.comparisons += 1;
        }
      }
      if (y + step < height) {
        const bottomOffset = ((y + step) * width + x) * 4;
        if (rgba[bottomOffset + 3] > alphaThreshold) {
          bucket.gradient += Math.abs(current - luminance(rgba, bottomOffset));
          bucket.comparisons += 1;
        }
      }
    }
  }

  const hasContent = maxX >= minX && maxY >= minY;
  const margins = hasContent
    ? {
        left: minX,
        right: width - maxX - 1,
        top: minY,
        bottom: height - maxY - 1
      }
    : {
        left: width,
        right: width,
        top: height,
        bottom: height
      };
  const horizontalMarginRatio = Math.min(margins.left, margins.right) / width;
  const verticalMarginRatio = Math.min(margins.top, margins.bottom) / height;
  const centerGradientDensity = details.center.comparisons
    ? details.center.gradient / details.center.comparisons
    : 0;
  const perimeterGradientDensity = details.perimeter.comparisons
    ? details.perimeter.gradient / details.perimeter.comparisons
    : 0;
  const centerAlphaCoverage = details.center.pixels
    ? details.center.alpha / details.center.pixels
    : 0;
  const perimeterAlphaCoverage = details.perimeter.pixels
    ? details.perimeter.alpha / details.perimeter.pixels
    : 0;

  return {
    width,
    height,
    aspectRatio: roundMetric(width / height),
    hasAlpha: semiTransparentPixels > 0 || fullyTransparentPixels > 0,
    alphaCoverage: roundMetric(opaquePixels / (width * height)),
    transparentPixelRatio: roundMetric(fullyTransparentPixels / (width * height)),
    semiTransparentPixelRatio: roundMetric(semiTransparentPixels / (width * height)),
    nonTransparentBounds: hasContent
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        }
      : null,
    transparentMargin: margins,
    transparentMarginMinRatio: roundMetric(Math.min(horizontalMarginRatio, verticalMarginRatio)),
    transparentMarginHorizontalRatio: roundMetric(horizontalMarginRatio),
    transparentMarginVerticalRatio: roundMetric(verticalMarginRatio),
    edgeBand,
    edgeAlphaCoverage: roundMetric(edgePixels ? edgeAlphaPixels / edgePixels : 0),
    edgeAlphaDirtyRatio: roundMetric(edgePixels ? edgeSemiTransparentPixels / edgePixels : 0),
    centerAlphaCoverage: roundMetric(clampRatio(centerAlphaCoverage)),
    perimeterAlphaCoverage: roundMetric(clampRatio(perimeterAlphaCoverage)),
    centerGradientDensity: roundMetric(centerGradientDensity),
    perimeterGradientDensity: roundMetric(perimeterGradientDensity),
    perimeterToCenterDetailRatio: roundMetric(perimeterGradientDensity / Math.max(0.0001, centerGradientDensity)),
    centerToPerimeterDetailRatio: roundMetric(centerGradientDensity / Math.max(0.0001, perimeterGradientDensity)),
    quantizedColorCount: colors.size
  };
}

function analyzePngFile(filePath, options = {}) {
  const buffer = fs.readFileSync(filePath);
  const parsed = parsePng(buffer, options);
  return {
    filePath,
    ...analyzePngData(parsed, options)
  };
}

module.exports = {
  analyzePngData,
  analyzePngFile,
  parsePng
};
