/* =========================================================
   Combobox customizado reutilizável para qualquer <select>.

   Por que existe: um <select> nativo não aceita marcação dentro da <option>
   (só texto puro) e o navegador desenha a lista aberta fora do alcance do
   CSS da página - por isso o campo Veículo virou, na prática, um componente
   à parte (trigger + <ul role="listbox"> customizados). Este arquivo
   generaliza aquele padrão pra qualquer <select> do sistema, com dois
   objetivos: (1) todo campo de seleção ganha a mesma aparência, e (2)
   qualquer campo <select> novo que alguém adicionar no HTML no futuro já
   nasce com esse visual, sem precisar lembrar de ligar nada.

   Como funciona: o <select> original continua exatamente onde está no DOM
   (só reparented para dentro de um wrapper, o que NÃO invalida referências
   já obtidas via document.getElementById em outros arquivos) e continua
   sendo a fonte da verdade - todo o resto do código já existente continua
   lendo/escrevendo .value, repopulando via innerHTML e escutando 'change'
   nele sem qualquer alteração. Um <button> + <ul> customizados são
   inseridos ao lado, funcionando só como camada visual/interativa: refletem
   o estado do <select> e, a cada escolha, escrevem de volta nele e disparam
   'change' - exatamente a mesma ponte usada no campo Veículo.

   Sincronização automática: como só o <select> real muda (outros arquivos
   fazem select.innerHTML = '...' e select.value = x, sem saber que existe
   um wrapper), este componente intercepta os setters de .value/.disabled
   do próprio elemento e observa mutações no DOM dele (MutationObserver) -
   qualquer alteração externa se reflete na UI customizada automaticamente,
   sem precisar tocar nos ~30 pontos do código que hoje populam esses
   campos.
   ========================================================= */

let styledSelectCounter = 0;

function buildStyledSelectArrow(){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'styled-select-arrow');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '8');
  svg.setAttribute('viewBox', '0 0 12 8');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M1 1l5 5 5-5');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

// Instâncias com a lista aberta no momento - usado pelo único listener de
// clique fora (document) que fecha qualquer combobox customizado da tela,
// em vez de um listener por instância.
const openStyledSelects = new Set();

document.addEventListener('click', function(event){
  if(!openStyledSelects.size) return;
  Array.from(openStyledSelects).forEach(instance => {
    if(!instance.wrapper.contains(event.target)) instance.close();
  });
});

document.addEventListener('keydown', function(event){
  if(event.key !== 'Escape' || !openStyledSelects.size) return;
  Array.from(openStyledSelects).forEach(instance => {
    instance.close();
    instance.trigger.focus();
  });
});

// config.optionExtra(optionEl, index) -> string HTML opcional, anexado
// dentro do <li> (usado pela etiqueta "Recomendado" nos campos de veículo).
function createStyledSelect(selectEl, config){
  if(!selectEl || selectEl.tagName !== 'SELECT') return null;
  if(selectEl._styledSelect) return selectEl._styledSelect;
  config = config || {};

  const wrapper = document.createElement('div');
  wrapper.className = 'styled-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'styled-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const describedBy = selectEl.getAttribute('aria-describedby');
  if(describedBy) trigger.setAttribute('aria-describedby', describedBy);

  const labelEl = selectEl.id ? document.querySelector('label[for="' + selectEl.id + '"]') : null;
  if(labelEl){
    trigger.setAttribute('aria-label', labelEl.textContent.trim());
    // O <label for="idDoSelect"> nativo tenta focar o select ao ser clicado -
    // como ele fica visualmente escondido, isso não tem efeito nenhum sem
    // isto aqui redirecionando o foco pro botão visível.
    labelEl.addEventListener('click', function(event){
      event.preventDefault();
      trigger.focus();
    });
  } else {
    const ariaLabel = selectEl.getAttribute('aria-label');
    if(ariaLabel) trigger.setAttribute('aria-label', ariaLabel);
  }

  const triggerValue = document.createElement('span');
  triggerValue.className = 'styled-select-trigger-value';
  trigger.appendChild(triggerValue);
  trigger.appendChild(buildStyledSelectArrow());

  const listboxId = 'styledSelectList-' + (++styledSelectCounter);
  const listbox = document.createElement('ul');
  listbox.className = 'styled-select-list hidden';
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  listbox.tabIndex = -1;
  trigger.setAttribute('aria-controls', listboxId);

  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(trigger);
  wrapper.appendChild(listbox);
  wrapper.appendChild(selectEl);

  selectEl.classList.add('hidden');
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.tabIndex = -1;

  function isOpen(){
    return !listbox.classList.contains('hidden');
  }

  function close(){
    listbox.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    listbox.removeAttribute('aria-activedescendant');
    openStyledSelects.delete(instance);
  }

  function optionEls(){
    return Array.from(listbox.querySelectorAll('[role="option"]'));
  }

  function selectableOptionEls(){
    return optionEls().filter(item => item.getAttribute('aria-disabled') !== 'true');
  }

  function setActive(index){
    const items = selectableOptionEls();
    if(!items.length) return;
    const safeIndex = Math.max(0, Math.min(items.length - 1, index));
    optionEls().forEach(item => item.classList.remove('active'));
    items[safeIndex].classList.add('active');
    listbox.setAttribute('aria-activedescendant', items[safeIndex].id);
    items[safeIndex].scrollIntoView({ block:'nearest' });
  }

  function open(){
    if(trigger.disabled || isOpen()) return;
    const items = selectableOptionEls();
    if(!items.length) return;
    listbox.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    const currentIndex = items.findIndex(item => item.getAttribute('data-value') === selectEl.value);
    setActive(currentIndex >= 0 ? currentIndex : 0);
    listbox.focus();
    openStyledSelects.add(instance);
  }

  function applyValue(value){
    if(selectEl.value === value) return;
    nativeValueSetter.call(selectEl, value);
    sync();
    selectEl.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function selectOption(value){
    applyValue(value);
    close();
    trigger.focus();
  }

  let syncing = false;
  function sync(){
    if(syncing) return;
    syncing = true;
    try{
      const options = Array.from(selectEl.options);
      listbox.innerHTML = options.map((opt, index) => {
        const value = opt.value;
        const selected = value === selectEl.value;
        const extra = typeof config.optionExtra === 'function' ? (config.optionExtra(opt, index) || '') : '';
        const id = listboxId + '-opt-' + index;
        return '<li role="option" id="' + id + '" data-value="' + escapeHTML(value) + '"' +
          ' class="styled-select-option' + (selected ? ' active' : '') + '"' +
          ' aria-selected="' + selected + '"' +
          (opt.disabled ? ' aria-disabled="true"' : '') + '>' +
          '<span>' + escapeHTML(opt.textContent) + '</span>' + extra +
          '</li>';
      }).join('');

      const enabledOptions = options.filter(opt => !opt.disabled);
      trigger.disabled = selectEl.disabled || !enabledOptions.length;
      if(trigger.disabled && isOpen()) close();

      const selectedOption = options.find(opt => opt.value === selectEl.value);
      const hasRealValue = !!(selectedOption && selectedOption.value !== '');
      triggerValue.textContent = selectedOption ? selectedOption.textContent : 'Selecione...';
      trigger.classList.toggle('has-value', hasRealValue);

      const requiredNow = selectEl.hasAttribute('required') || selectEl.getAttribute('aria-required') === 'true';
      trigger.setAttribute('aria-required', String(requiredNow));
    } finally {
      syncing = false;
    }
  }

  trigger.addEventListener('click', function(){
    if(isOpen()) close(); else open();
  });

  trigger.addEventListener('keydown', function(event){
    if(['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)){
      event.preventDefault();
      open();
    }
  });

  listbox.addEventListener('click', function(event){
    const option = event.target.closest('[role="option"]');
    if(option && option.getAttribute('aria-disabled') !== 'true'){
      selectOption(option.getAttribute('data-value'));
    }
  });

  listbox.addEventListener('keydown', function(event){
    const items = selectableOptionEls();
    const activeIndex = items.findIndex(item => item.classList.contains('active'));
    if(event.key === 'ArrowDown'){
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if(event.key === 'ArrowUp'){
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if(event.key === 'Home'){
      event.preventDefault();
      setActive(0);
    } else if(event.key === 'End'){
      event.preventDefault();
      setActive(items.length - 1);
    } else if(event.key === 'Enter' || event.key === ' '){
      event.preventDefault();
      if(activeIndex >= 0) selectOption(items[activeIndex].getAttribute('data-value'));
    } else if(event.key === 'Tab'){
      close();
    }
  });

  // .value/.disabled interceptados: o resto do código continua escrevendo
  // neles do jeito de sempre (select.value = x, select.disabled = true) sem
  // saber que existe um wrapper - só precisamos reagir depois que o valor
  // real muda.
  const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  const nativeValueGetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').get;
  Object.defineProperty(selectEl, 'value', {
    configurable:true,
    get(){ return nativeValueGetter.call(selectEl); },
    set(v){ nativeValueSetter.call(selectEl, v); sync(); }
  });

  const nativeDisabledSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled').set;
  const nativeDisabledGetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled').get;
  Object.defineProperty(selectEl, 'disabled', {
    configurable:true,
    get(){ return nativeDisabledGetter.call(selectEl); },
    set(v){ nativeDisabledSetter.call(selectEl, v); sync(); }
  });

  // Repopular via innerHTML (o padrão usado em todo o projeto) não passa
  // pelos setters acima - só o MutationObserver pega essa troca.
  const observer = new MutationObserver(function(){ sync(); });
  observer.observe(selectEl, {
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['disabled', 'required', 'aria-required']
  });

  const instance = {
    wrapper: wrapper,
    trigger: trigger,
    listbox: listbox,
    select: selectEl,
    sync: sync,
    close: close,
    isOpen: isOpen
  };
  selectEl._styledSelect = instance;

  sync();
  return instance;
}

// Converte automaticamente todo <select> ainda não tratado da página - é o
// que garante que um campo <select> novo, adicionado no futuro sem ninguém
// lembrar de "ligar" nada, já nasce com o mesmo visual. Campos que precisam
// de config especial (ex.: etiqueta "Recomendado" nos de veículo) marcam
// data-styled-select-manual no HTML e chamam createStyledSelect() no
// próprio arquivo, com a config deles - esta função pula esses.
function initStyledSelects(root){
  (root || document).querySelectorAll('select').forEach(function(select){
    if(select._styledSelect || select.hasAttribute('data-styled-select-manual')) return;
    createStyledSelect(select);
  });
}

// Roda assim que este script é interpretado - todo <select> do HTML já
// existe nesse ponto (scripts ficam no fim do <body>), mesmo que as
// <option> de muitos deles só sejam preenchidas depois, por outros
// arquivos carregados na sequência (o MutationObserver de cada instância
// cobre isso). Os poucos campos com config própria (badge "Recomendado")
// marcam data-styled-select-manual no HTML pra serem pulados aqui e
// ligados explicitamente pelo arquivo responsável.
initStyledSelects();
