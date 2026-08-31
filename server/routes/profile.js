const express = require('express');
const { ValidationError } = require('../validation');
const {
  LADOS,
  licensePayload,
  getLicenseForUser,
  saveLicenseForUser,
  readLicensePhoto
} = require('../driver-licenses');

const router = express.Router();

router.get('/cnh', async (req, res) => {
  const license = await getLicenseForUser(req.user.id);
  res.json(licensePayload(license));
});

router.put('/cnh', async (req, res) => {
  const body = req.body || {};
  try{
    const license = await saveLicenseForUser(
      req.user.id,
      { numero:body.numero, categoria:body.categoria, validade:body.validade },
      { frente:body.frente, verso:body.verso }
    );
    res.json(licensePayload(license));
  }catch(error){
    if(error instanceof ValidationError){
      return res.status(400).json({ error:error.message });
    }
    throw error;
  }
});

// Documento pessoal: servido só para o dono ou para quem administra usuários,
// sempre com no-store, e nunca por rota estática. Responde 404 (e não 403)
// para quem não pode ver, para não confirmar a existência do arquivo.
router.get('/cnh/:userId/:lado', async (req, res) => {
  const { userId, lado } = req.params;
  const isOwner = String(userId) === String(req.user.id);
  if(!isOwner && !req.user.permissions.users){
    return res.status(404).json({ error:'Arquivo não encontrado.' });
  }
  if(!LADOS.includes(lado)){
    return res.status(404).json({ error:'Arquivo não encontrado.' });
  }

  const photo = await readLicensePhoto(userId, lado);
  if(!photo) return res.status(404).json({ error:'Arquivo não encontrado.' });

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', photo.contentType);
  res.setHeader('Content-Disposition', `inline; filename="cnh-${lado}"`);
  res.send(photo.bytes);
});

module.exports = router;
