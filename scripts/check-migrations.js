#!/usr/bin/env node
/*
 * Confere a numeração dos arquivos em db/migrations/.
 *
 * O runner de migrations aplica os arquivos em ordem alfabética do nome.
 * Isso torna dois problemas silenciosos e caros:
 *
 *   - prefixo duplicado (dois "021_"): a ordem entre eles passa a depender
 *     do sistema de arquivos, então a mesma branch pode aplicar em ordens
 *     diferentes em máquinas diferentes;
 *   - buraco na sequência (pula do 020 para 022): quase sempre é um arquivo
 *     que ficou de fora do commit.
 *
 * Roda no CI antes dos testes, e também serve como `node scripts/check-migrations.js`
 * local antes de abrir PR.
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'db', 'migrations');

function main() {
  if (!fs.existsSync(dir)) {
    console.error(`Diretório de migrations não encontrado: ${dir}`);
    process.exit(1);
  }

  const arquivos = fs
    .readdirSync(dir)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  if (!arquivos.length) {
    console.error('Nenhuma migration encontrada.');
    process.exit(1);
  }

  const problemas = [];
  const porPrefixo = new Map();

  for (const nome of arquivos) {
    const match = nome.match(/^(\d+)_[\w-]+\.sql$/);
    if (!match) {
      problemas.push(
        `${nome}: nome fora do padrão esperado (ex.: 021_descricao_curta.sql)`
      );
      continue;
    }
    const numero = Number(match[1]);
    if (!porPrefixo.has(numero)) porPrefixo.set(numero, []);
    porPrefixo.get(numero).push(nome);
  }

  for (const [numero, nomes] of porPrefixo) {
    if (nomes.length > 1) {
      problemas.push(
        `prefixo ${String(numero).padStart(3, '0')} duplicado: ${nomes.join(', ')}`
      );
    }
  }

  const numeros = [...porPrefixo.keys()].sort((a, b) => a - b);
  for (let i = 1; i < numeros.length; i++) {
    const anterior = numeros[i - 1];
    const atual = numeros[i];
    if (atual !== anterior + 1) {
      const faltando = [];
      for (let n = anterior + 1; n < atual; n++) {
        faltando.push(String(n).padStart(3, '0'));
      }
      problemas.push(
        `buraco na sequência entre ${String(anterior).padStart(3, '0')} e ` +
          `${String(atual).padStart(3, '0')} (faltando: ${faltando.join(', ')})`
      );
    }
  }

  if (problemas.length) {
    console.error('Problemas na numeração das migrations:\n');
    for (const p of problemas) console.error(`  - ${p}`);
    console.error('');
    process.exit(1);
  }

  const ultima = numeros[numeros.length - 1];
  console.log(
    `OK: ${arquivos.length} migrations, numeração contígua até ` +
      `${String(ultima).padStart(3, '0')}.`
  );
}

main();
