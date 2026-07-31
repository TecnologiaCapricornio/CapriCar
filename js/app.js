/* Inicialização da aplicação — deve ser carregado por último */
/* =========================================================
   Inicialização: login persistido ou tela de login
   ========================================================= */
(async function initializeApplication(){
  try{
    const session = await apiRequest('/api/auth/me');
    const user = accountToSession(session.user);
    setCurrentUser(user);
    await hydrateDatabaseState();
    showApp(user);
  }catch(error){
    databaseHydrated = false;
    clearCurrentUser();
    showLogin();
  }
})();
