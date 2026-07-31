const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function candidates(tool, configuredPath){
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
  const values = [];
  if(configuredPath) values.push(configuredPath);
  if(process.platform === 'win32'){
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    for(let version = 20; version >= 12; version--){
      values.push(path.join(programFiles, 'PostgreSQL', String(version), 'bin', executable));
    }
  }
  values.push(executable);
  return [...new Set(values)];
}

function runPostgresTool(tool, args, options){
  const config = options || {};
  for(const candidate of candidates(tool, config.configuredPath)){
    if(path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const result = spawnSync(candidate, args, {
      env:config.env,
      encoding:'utf8',
      windowsHide:true,
      stdio:config.stdio || 'pipe'
    });
    if(!result.error && result.status === 0) return result;
    if(result.error && result.error.code === 'ENOENT') continue;
    const details = String(result.stderr || result.stdout || '').trim();
    throw new Error(details || `${tool} terminou com código ${result.status}.`);
  }
  throw new Error(
    `${tool} não foi encontrado. Instale as ferramentas de linha de comando do PostgreSQL ` +
    `ou configure ${tool === 'pg_dump' ? 'PG_DUMP_PATH' : 'PG_RESTORE_PATH'} no .env.`
  );
}

module.exports = { runPostgresTool };
