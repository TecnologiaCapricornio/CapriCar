const { ValidationError } = require('../validation');

// Recusa da importação da e-CNH. É um ValidationError (a rota já sabe
// responder 4xx com a mensagem), com um código estável para os testes e o
// frontend - a mensagem é para o usuário e nunca repete dados lidos do
// documento.
class ECnhError extends ValidationError {
  constructor(message, code){
    super(message, 422);
    this.code = code;
  }
}

module.exports = { ECnhError };
