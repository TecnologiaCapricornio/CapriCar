/* Alternância e persistência do tema visual */
const THEME_STORAGE_KEY = 'capricar_theme';

function getPreferredTheme(){
  try{
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if(saved === 'light' || saved === 'dark') return saved;
  }catch(error){
    console.warn('Não foi possível ler a preferência de tema:', error);
  }

  const current = document.documentElement.getAttribute('data-theme');
  if(current === 'light' || current === 'dark') return current;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getActiveTheme(){
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function updateThemeControls(){
  const isLight = getActiveTheme() === 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-label', isLight ? 'Ativar tema escuro' : 'Ativar tema claro');
    button.setAttribute('title', isLight ? 'Usar tema escuro' : 'Usar tema claro');
    button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  });
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if(themeColor) themeColor.setAttribute('content', isLight ? '#f5f6f8' : '#1b1d21');
}

function setActiveTheme(theme){
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  try{
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  }catch(error){
    console.warn('Não foi possível salvar a preferência de tema:', error);
  }
  updateThemeControls();
}

document.querySelectorAll('[data-theme-toggle]').forEach(button => {
  button.addEventListener('click', function(){
    setActiveTheme(getActiveTheme() === 'light' ? 'dark' : 'light');
  });
});

document.documentElement.setAttribute('data-theme', getPreferredTheme());
updateThemeControls();
