const test = require('node:test');
const assert = require('node:assert/strict');
const { buildXlsxWorkbook } = require('../js/xlsx-export.js');

function readStoredZip(bytes){
  const files = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  let offset = 0;
  while(offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034B50){
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

test('gera um arquivo XLSX válido com acentos e valores preservados', () => {
  const bytes = buildXlsxWorkbook(
    ['Filial', 'Combustível', 'Km rodados'],
    [['São Paulo', '1/2', 1250]],
    [18, 16, 14]
  );
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4B);
  const files = readStoredZip(bytes);
  [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml'
  ].forEach(name => assert.ok(files.has(name), 'arquivo ausente no XLSX: ' + name));
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /São Paulo/);
  assert.match(sheet, /Combustível/);
  assert.match(sheet, />1\/2</);
  assert.match(sheet, /t="n"><v>1250<\/v>/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:C2"\/>/);
});
