/* Inicialização da aplicação — deve ser carregado por último */
/* =========================================================
   Inicialização: login persistido ou tela de login
   ========================================================= */
const existingUser = getCurrentUser();
if(existingUser && existingUser.nome){
  showApp(existingUser);
} else {
  showLogin();
}
