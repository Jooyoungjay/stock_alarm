const versionConfigs = [
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, alignment: [6, 26] }
];

const BYTE_MODE = 0b0100;
const FORMAT_ERROR_CORRECTION_LOW = 0b01;
const MASK_PATTERN = 0;

const gfExp = new Array(512);
const gfLog = new Array(256);

let value = 1;
for (let index = 0; index < 255; index += 1) {
  gfExp[index] = value;
  gfLog[value] = index;
  value <<= 1;

  if (value & 0x100) {
    value ^= 0x11d;
  }
}

for (let index = 255; index < 512; index += 1) {
  gfExp[index] = gfExp[index - 255];
}

export function createQrSvg(text, options = {}) {
  const matrix = createQrMatrix(text);
  const margin = options.margin ?? 4;
  const scale = options.scale ?? 6;
  const size = matrix.length + margin * 2;
  const pixelSize = size * scale;
  const paths = [];

  for (let y = 0; y < matrix.length; y += 1) {
    let start = -1;

    for (let x = 0; x <= matrix.length; x += 1) {
      if (x < matrix.length && matrix[y][x]) {
        if (start === -1) {
          start = x;
        }
        continue;
      }

      if (start !== -1) {
        paths.push(`M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`);
        start = -1;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${pixelSize}" height="${pixelSize}" role="img" aria-label="접속 QR 코드">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<path fill="#0d1117" d="${paths.join('')}"/>`,
    '</svg>'
  ].join('');
}

export function createQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || '')));
  const config = selectVersionConfig(bytes.length);
  const data = createDataCodewords(bytes, config.dataCodewords);
  const ecc = createErrorCorrectionCodewords(data, config.eccCodewords);
  const matrix = Array.from({ length: config.size }, () => Array(config.size).fill(null));
  const reserved = Array.from({ length: config.size }, () => Array(config.size).fill(false));

  drawFunctionPatterns(matrix, reserved, config);
  drawCodewords(matrix, reserved, [...data, ...ecc]);
  drawFormatBits(matrix, reserved);

  return matrix;
}

function selectVersionConfig(byteLength) {
  const config = versionConfigs.find((item) => byteLength <= getByteCapacity(item.dataCodewords));

  if (!config) {
    throw new Error('QR 코드로 만들 주소가 너무 깁니다.');
  }

  return config;
}

function getByteCapacity(dataCodewords) {
  return Math.floor((dataCodewords * 8 - 4 - 8 - 4) / 8);
}

function createDataCodewords(bytes, capacity) {
  const bits = [];
  appendBits(bits, BYTE_MODE, 4);
  appendBits(bits, bytes.length, 8);

  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const maxBits = capacity * 8;
  const terminatorLength = Math.min(4, maxBits - bits.length);
  appendBits(bits, 0, terminatorLength);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const data = [];

  for (let index = 0; index < bits.length; index += 8) {
    data.push(bitsToByte(bits.slice(index, index + 8)));
  }

  for (let padIndex = 0; data.length < capacity; padIndex += 1) {
    data.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return data;
}

function appendBits(bits, number, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((number >>> index) & 1);
  }
}

function bitsToByte(bits) {
  return bits.reduce((result, bit) => (result << 1) | bit, 0);
}

function createErrorCorrectionCodewords(data, degree) {
  const divisor = createReedSolomonDivisor(degree);
  const result = Array(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);

    for (let index = 0; index < divisor.length; index += 1) {
      result[index] ^= gfMultiply(divisor[index], factor);
    }
  }

  return result;
}

function createReedSolomonDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;

  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < degree; item += 1) {
      result[item] = gfMultiply(result[item], root);

      if (item + 1 < degree) {
        result[item] ^= result[item + 1];
      }
    }

    root = gfMultiply(root, 0x02);
  }

  return result;
}

function gfMultiply(left, right) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return gfExp[gfLog[left] + gfLog[right]];
}

function drawFunctionPatterns(matrix, reserved, config) {
  const last = config.size - 7;

  drawFinderPattern(matrix, reserved, 0, 0);
  drawFinderPattern(matrix, reserved, last, 0);
  drawFinderPattern(matrix, reserved, 0, last);
  drawTimingPatterns(matrix, reserved);
  drawAlignmentPatterns(matrix, reserved, config);
  reserveFormatAreas(matrix, reserved);
}

function setModule(matrix, reserved, x, y, dark, isFunction = true) {
  if (x < 0 || y < 0 || y >= matrix.length || x >= matrix.length) {
    return;
  }

  matrix[y][x] = Boolean(dark);

  if (isFunction) {
    reserved[y][x] = true;
  }
}

function drawFinderPattern(matrix, reserved, left, top) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const actualX = left + x;
      const actualY = top + y;

      if (actualX < 0 || actualY < 0 || actualX >= matrix.length || actualY >= matrix.length) {
        continue;
      }

      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const dark =
        inFinder &&
        (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));

      setModule(matrix, reserved, actualX, actualY, dark);
    }
  }
}

function drawTimingPatterns(matrix, reserved) {
  for (let index = 8; index < matrix.length - 8; index += 1) {
    const dark = index % 2 === 0;
    setModule(matrix, reserved, index, 6, dark);
    setModule(matrix, reserved, 6, index, dark);
  }
}

function drawAlignmentPatterns(matrix, reserved, config) {
  for (const centerY of config.alignment) {
    for (const centerX of config.alignment) {
      if (reserved[centerY]?.[centerX]) {
        continue;
      }

      drawAlignmentPattern(matrix, reserved, centerX, centerY);
    }
  }
}

function drawAlignmentPattern(matrix, reserved, centerX, centerY) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setModule(matrix, reserved, centerX + x, centerY + y, distance !== 1);
    }
  }
}

function reserveFormatAreas(matrix, reserved) {
  const size = matrix.length;

  for (let index = 0; index <= 5; index += 1) {
    setModule(matrix, reserved, 8, index, false);
  }

  setModule(matrix, reserved, 8, 7, false);
  setModule(matrix, reserved, 8, 8, false);
  setModule(matrix, reserved, 7, 8, false);

  for (let index = 9; index < 15; index += 1) {
    setModule(matrix, reserved, 14 - index, 8, false);
  }

  for (let index = 0; index < 8; index += 1) {
    setModule(matrix, reserved, size - 1 - index, 8, false);
  }

  for (let index = 8; index < 15; index += 1) {
    setModule(matrix, reserved, 8, size - 15 + index, false);
  }

  setModule(matrix, reserved, 8, size - 8, true);
}

function drawCodewords(matrix, reserved, codewords) {
  let bitIndex = 0;
  const size = matrix.length;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;

        if (reserved[y][x]) {
          continue;
        }

        const codeword = codewords[Math.floor(bitIndex / 8)] || 0;
        const bit = ((codeword >>> (7 - (bitIndex % 8))) & 1) === 1;
        matrix[y][x] = bit !== shouldMask(x, y);
        bitIndex += 1;
      }
    }
  }
}

function shouldMask(x, y) {
  return (x + y) % 2 === 0;
}

function drawFormatBits(matrix, reserved) {
  const size = matrix.length;
  const bits = calculateFormatBits();

  for (let index = 0; index <= 5; index += 1) {
    setModule(matrix, reserved, 8, index, getBit(bits, index));
  }

  setModule(matrix, reserved, 8, 7, getBit(bits, 6));
  setModule(matrix, reserved, 8, 8, getBit(bits, 7));
  setModule(matrix, reserved, 7, 8, getBit(bits, 8));

  for (let index = 9; index < 15; index += 1) {
    setModule(matrix, reserved, 14 - index, 8, getBit(bits, index));
  }

  for (let index = 0; index < 8; index += 1) {
    setModule(matrix, reserved, size - 1 - index, 8, getBit(bits, index));
  }

  for (let index = 8; index < 15; index += 1) {
    setModule(matrix, reserved, 8, size - 15 + index, getBit(bits, index));
  }

  setModule(matrix, reserved, 8, size - 8, true);
}

function calculateFormatBits() {
  const data = (FORMAT_ERROR_CORRECTION_LOW << 3) | MASK_PATTERN;
  let remainder = data;

  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }

  return ((data << 10) | remainder) ^ 0x5412;
}

function getBit(bits, index) {
  return ((bits >>> index) & 1) !== 0;
}
