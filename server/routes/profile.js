const express = require('express');
const { ValidationError } = require('../validation');
const {
  CATEGORIAS,
  licensePayload,
  getLicenseForUser,
  saveVerifiedLicense,
  removeLicenseForUser
} = require('../driver-licenses');
const { readECnh, MAX_PDF_BYTES } = require('../ecnh');

const router = express.Router();

router.get('/cnh', async (req, res) => {
  const license = await getLicenseForUser(req.user.id);
  res.json(licensePayload(license));
});

// Importação da e-CNH. O PDF chega como corpo bruto (application/pdf) e fica
// só em memória: é lido, validado e descartado ao fim da requisição - nunca é
// gravado em disco, no banco ou em log. Só número, categoria e validade são
// guardados (ver server/ecnh/index.js).
router.post(
  '/cnh/e-cnh',
  express.raw({ type:'application/pdf', limit:MAX_PDF_BYTES }),
  async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try{
      const pdf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const dados = await readECnh(pdf, { nomeCadastro:req.user.nome, categorias:CATEGORIAS });
      const license = await saveVerifiedLicense(req.user.id, dados);
      res.json(licensePayload(license));
    }catch(error){
      if(error instanceof ValidationError){
        return res.status(error.status || 400).json({ error:error.message, code:error.code });
      }
      throw error;
    }
  }
);

router.delete('/cnh', async (req, res) => {
  await removeLicenseForUser(req.user.id);
  res.json(licensePayload(null));
});

// A CNH não pode mais ser digitada: responde 410 para clientes antigos (aba
// aberta antes do deploy) em vez de aceitar dados sem verificação.
router.put('/cnh', (req, res) => {
  res.status(410).json({
    error:'O cadastro manual da CNH foi desativado. Atualize a página e importe a sua e-CNH (PDF).'
  });
});

module.exports = router;
