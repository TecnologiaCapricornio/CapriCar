/* Gerador mínimo de XLSX sem dependências externas.
   Cria um workbook Office Open XML válido usando ZIP sem compressão. */
(function(root){
  function utf8(value){
    return new TextEncoder().encode(value);
  }

  function write16(view, offset, value){
    view.setUint16(offset, value, true);
  }

  function write32(view, offset, value){
    view.setUint32(offset, value >>> 0, true);
  }

  function concatBytes(chunks){
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for(let n = 0; n < 256; n++){
      let value = n;
      for(let bit = 0; bit < 8; bit++){
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[n] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes){
    let crc = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i++){
      crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(){
    const date = new Date();
    const year = Math.max(1980, date.getFullYear());
    return {
      time:(date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date:((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function zipStore(files){
    const localChunks = [];
    const centralChunks = [];
    const stamp = dosDateTime();
    let localOffset = 0;

    files.forEach(file => {
      const name = utf8(file.name);
      const data = utf8(file.content);
      const checksum = crc32(data);
      const localHeader = new Uint8Array(30);
      const localView = new DataView(localHeader.buffer);
      write32(localView, 0, 0x04034B50);
      write16(localView, 4, 20);
      write16(localView, 6, 0x0800);
      write16(localView, 8, 0);
      write16(localView, 10, stamp.time);
      write16(localView, 12, stamp.date);
      write32(localView, 14, checksum);
      write32(localView, 18, data.length);
      write32(localView, 22, data.length);
      write16(localView, 26, name.length);
      write16(localView, 28, 0);
      localChunks.push(localHeader, name, data);

      const centralHeader = new Uint8Array(46);
      const centralView = new DataView(centralHeader.buffer);
      write32(centralView, 0, 0x02014B50);
      write16(centralView, 4, 20);
      write16(centralView, 6, 20);
      write16(centralView, 8, 0x0800);
      write16(centralView, 10, 0);
      write16(centralView, 12, stamp.time);
      write16(centralView, 14, stamp.date);
      write32(centralView, 16, checksum);
      write32(centralView, 20, data.length);
      write32(centralView, 24, data.length);
      write16(centralView, 28, name.length);
      write16(centralView, 30, 0);
      write16(centralView, 32, 0);
      write16(centralView, 34, 0);
      write16(centralView, 36, 0);
      write32(centralView, 38, 0);
      write32(centralView, 42, localOffset);
      centralChunks.push(centralHeader, name);
      localOffset += localHeader.length + name.length + data.length;
    });

    const centralDirectory = concatBytes(centralChunks);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    write32(endView, 0, 0x06054B50);
    write16(endView, 4, 0);
    write16(endView, 6, 0);
    write16(endView, 8, files.length);
    write16(endView, 10, files.length);
    write32(endView, 12, centralDirectory.length);
    write32(endView, 16, localOffset);
    write16(endView, 20, 0);
    return concatBytes(localChunks.concat([centralDirectory, end]));
  }

  function escapeXml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnName(index){
    let name = '';
    let current = index + 1;
    while(current > 0){
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }
    return name;
  }

  function cellXml(value, rowIndex, columnIndex, styleId){
    const reference = columnName(columnIndex) + rowIndex;
    if(typeof value === 'number' && Number.isFinite(value)){
      return '<c r="' + reference + '" s="' + styleId + '" t="n"><v>' + value + '</v></c>';
    }
    return '<c r="' + reference + '" s="' + styleId + '" t="inlineStr"><is><t xml:space="preserve">' +
      escapeXml(value) + '</t></is></c>';
  }

  function buildXlsxWorkbook(headers, rows, widths){
    const allRows = [headers].concat(rows);
    const sheetRows = allRows.map((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      const cells = row.map((value, columnIndex) =>
        cellXml(value, excelRow, columnIndex, rowIndex === 0 ? 1 : 2)
      ).join('');
      return '<row r="' + excelRow + '"' + (rowIndex === 0 ? ' ht="30" customHeight="1"' : '') + '>' + cells + '</row>';
    }).join('');
    const columns = widths.map((width, index) =>
      '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'
    ).join('');
    const lastColumn = columnName(headers.length - 1);
    const lastRow = Math.max(1, allRows.length);

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';
    const rootRelationships =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';
    const workbookRelationships =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
    const styles =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="10"/><name val="Arial"/></font>' +
          '<font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
          '<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5A"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="2"><border/><border><left style="thin"><color rgb="FFD8E4ED"/></left>' +
          '<right style="thin"><color rgb="FFD8E4ED"/></right><top style="thin"><color rgb="FFD8E4ED"/></top>' +
          '<bottom style="thin"><color rgb="FFD8E4ED"/></bottom></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3">' +
          '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
          '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
          '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
        '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
    const worksheet =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        '<cols>' + columns + '</cols><sheetData>' + sheetRows + '</sheetData>' +
        '<autoFilter ref="A1:' + lastColumn + lastRow + '"/>' +
      '</worksheet>';

    return zipStore([
      { name:'[Content_Types].xml', content:contentTypes },
      { name:'_rels/.rels', content:rootRelationships },
      { name:'xl/workbook.xml', content:workbook },
      { name:'xl/_rels/workbook.xml.rels', content:workbookRelationships },
      { name:'xl/styles.xml', content:styles },
      { name:'xl/worksheets/sheet1.xml', content:worksheet }
    ]);
  }

  root.buildXlsxWorkbook = buildXlsxWorkbook;
  if(typeof module !== 'undefined' && module.exports){
    module.exports = { buildXlsxWorkbook };
  }
})(typeof window !== 'undefined' ? window : globalThis);
