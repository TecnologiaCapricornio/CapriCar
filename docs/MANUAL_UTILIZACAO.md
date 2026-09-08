# CapriCar — Manual de Utilização

Última revisão: 08/09/2026

Este manual é para quem usa o CapriCar no dia a dia — reservar um veículo,
pegar carona ou administrar a frota. Para detalhes de instalação, arquitetura
e API, veja a [documentação técnica](DOCUMENTACAO_TECNICA.md).

## Sumário

1. [Acessando o sistema](#1-acessando-o-sistema)
2. [Navegação geral](#2-navegação-geral)
3. [Nova Reserva](#3-nova-reserva)
4. [Minhas Reservas](#4-minhas-reservas)
5. [Caronas Disponíveis](#5-caronas-disponíveis)
6. [Calendário](#6-calendário)
7. [Retirada e devolução do veículo](#7-retirada-e-devolução-do-veículo)
8. [Meu perfil e CNH](#8-meu-perfil-e-cnh)
9. [Notificações](#9-notificações)
10. [Painel de Gestão](#10-painel-de-gestão)
11. [Dúvidas comuns](#11-dúvidas-comuns)

## 1. Acessando o sistema

Abra o endereço do CapriCar no navegador. Há duas formas de entrar,
dependendo do que estiver habilitado na sua empresa:

- **Login local**: usuário e senha cadastrados pelo administrador.
- **Entrar com Microsoft**: usa a conta corporativa (Entra ID/Microsoft
  365). Se ainda não existir uma conta CapriCar com esse e-mail, ela é criada
  automaticamente no primeiro acesso.

Se aparecer uma mensagem de bloqueio temporário, é porque houve várias
tentativas de senha incorreta seguidas — aguarde alguns minutos e tente de
novo, ou peça ao administrador para verificar sua conta.

## 2. Navegação geral

Depois de entrar, o topo da tela mostra as abas disponíveis:

- **Nova Reserva** — criar uma reserva;
- **Minhas Reservas** — suas reservas ativas e o histórico;
- **Caronas Disponíveis** — entrar como passageiro em uma reserva de outra
  pessoa;
- **Calendário** — visão semanal de todas as reservas por local/veículo;
- **Admin** ou **Gestão** — só aparece para quem tem alguma permissão de
  gestão (seção 10).

No canto superior, o sino mostra notificações (seção 9) e o seu avatar abre
o menu de perfil, com acesso a "Meu perfil" (CNH — seção 8) e a opção de
sair. O botão de lua/sol alterna entre tema claro e escuro; a escolha fica
salva no navegador — sem nada salvo, o padrão é o tema claro.

## 3. Nova Reserva

O formulário é dividido em duas etapas.

### Etapa 1 — Trajeto, veículo e período

1. Escolha o **local de partida**. O campo **Destino** e a lista de
   **veículos** daquele local são preenchidos a partir dele.
2. O campo **Veículo** já aparece sempre visível (mesmo antes de escolher o
   local) e mostra uma recomendação automática: o sistema sugere, entre os
   veículos disponíveis, o que está mais livre no momento — sem bloqueio
   próximo, sem avaria recente registrada, com menos reservas ativas e,
   por último critério, o de menor quilometragem. O veículo recomendado
   aparece com a etiqueta "Recomendado" na lista, mas você pode escolher
   qualquer outro.
3. Se a sua CNH não tiver a categoria mínima exigida pelo veículo escolhido
   (por capacidade de passageiros), o sistema avisa e não deixa avançar —
   melhor descobrir isso agora do que só na confirmação final. Se você ainda
   não cadastrou a CNH, o aviso pede para cadastrar em "Meu perfil" (seção 8).
4. Preencha **data de ida e de volta** e os **horários de retirada e
   devolução**. Só aparecem horários compatíveis com as reservas já
   existentes para aquele veículo.
5. Se aparecer um aviso de rodízio de placas para o trajeto/data escolhidos,
   leia com atenção antes de continuar.
6. Clique em **Próximo**. Essa é a hora em que tudo da etapa 1 é validado —
   se faltar algo ou houver algum conflito (veículo indisponível, CNH
   incompatível, limite de dias), o aviso aparece aqui, não só na
   confirmação final.

### Etapa 2 — Motivo, passageiros e confirmação

1. Informe o **motivo da viagem**.
2. Adicione **passageiros**, se houver — o sistema controla o limite de
   lugares do veículo escolhido (o motorista sempre ocupa o primeiro lugar).
3. Se caronas compatíveis com esse trajeto/veículo/data já estiverem
   disponíveis, elas aparecem aqui como sugestão antes de você confirmar uma
   reserva nova.
4. Confira as regras gerais de reserva quando solicitado e clique em
   **Confirmar**.

Depois de confirmada, a reserva aparece em "Minhas Reservas". Se você saiu
da tela sem confirmar, o formulário não guarda rascunho — ao reabrir "Nova
Reserva", ele começa em branco.

## 4. Minhas Reservas

Duas visões, alternadas por abas:

- **Ativas** — o que ainda vai acontecer ou está em andamento (aguardando
  retirada, em uso).
- **Histórico** — reservas concluídas ou canceladas.

Cada cartão mostra o trajeto, o veículo, o período e o status. Expandindo o
cartão aparecem motivo, responsável e quem solicitou. As ações disponíveis
mudam de acordo com o status:

- antes da retirada: editar ou cancelar;
- na hora certa (a partir do horário agendado): registrar a **retirada**
  (seção 7);
- depois da retirada, aguardando devolução: registrar a **devolução**
  (seção 7) — nesse ponto, os dados da reserva já não podem mais ser
  editados, só a devolução.

Uma reserva concluída ou cancelada some das ativas e do calendário, mas
continua disponível no histórico, na auditoria e nos relatórios.

## 5. Caronas Disponíveis

Mostra reservas de outras pessoas que ainda têm lugar. Para entrar como
passageiro, escolha a reserva e confirme — você não pode editar ou cancelar
a reserva do motorista, só a sua própria participação (saindo dela quando
quiser, antes da retirada).

**Aguardar carona**: se não houver nenhuma reserva compatível agora, você
pode salvar um monitoramento (rota + data) e será notificado automaticamente
quando alguém criar uma reserva compatível com o que você está esperando.
Cada pessoa pode manter até 20 monitoramentos ativos ao mesmo tempo.

## 6. Calendário

Visão semanal de todas as reservas, filtrável por local e veículo. Cada
reserva aparece como um evento no horário correspondente; cores diferentes
identificam veículos diferentes quando o filtro está em "todos os veículos"
de um local. Clique em um dia para ver o resumo e usar o seletor de datas ao
criar/editar uma reserva ou bloqueio.

## 7. Retirada e devolução do veículo

Quando chega a hora de pegar ou devolver o veículo, abra a reserva em
"Minhas Reservas" e use o botão correspondente. Em ambos os casos, informe:

- **quilometragem** atual do odômetro;
- **nível de combustível**;
- **avarias e observações**, se houver;
- até **três fotos** (1 MB cada), por exemplo do estado do veículo ou do
  painel;
- na **devolução**, também a **condição de limpeza** do veículo (agradável,
  excesso de sujeira interna ou externa) — é obrigatória.

**Se a quilometragem informada for menor que o esperado** (menor que a
retirada, ao devolver; ou menor que o odômetro atual do veículo, ao
retirar), o sistema não bloqueia — ele pergunta se você confirma mesmo
assim. Isso existe porque um dígito digitado errado não deveria te impedir
de concluir o registro. Se você confirmar, quem cuida da frota é avisado
para verificar o odômetro do veículo pessoalmente.

Depois da retirada, os dados principais da reserva ficam bloqueados — só a
devolução (ou, em casos excepcionais, um encerramento administrativo feito
pela gestão) pode ser registrada.

## 8. Meu perfil e CNH

No menu do seu avatar, abra "Meu perfil" para cadastrar ou atualizar sua
CNH: número, categoria, validade e fotos da frente e do verso.

- **CNH vencida** impede fazer reservas como motorista até ser atualizada.
- **CNH vencendo** apenas avisa, sem bloquear.
- A **categoria** precisa ser compatível com a capacidade do veículo
  escolhido na reserva — é essa comparação que gera o aviso na etapa 1 de
  Nova Reserva (seção 3).

## 9. Notificações

O sino no topo da tela mostra avisos gerados pelo uso do sistema: reserva
cancelada, alguém entrou ou saiu de uma carona sua, avaria/foto registrada
numa retirada ou devolução, divergência de odômetro, reserva próxima do
horário ou retirada atrasada. Clique em uma notificação para marcá-la como
lida e ir direto para o contexto relacionado.

Quando o administrador configura o envio de e-mail (aba Integrações — seção
10.9), alguns desses avisos também chegam por e-mail, além de lembretes
periódicos (reserva se aproximando, CNH vencendo, manutenção vencendo).

## 10. Painel de Gestão

Aparece como aba "Admin" (para administradores) ou "Gestão" (para quem tem
alguma permissão específica, mesmo sem ser administrador). Cada aba abaixo
só é visível para quem tem a permissão correspondente.

### 10.1 Reservas

Reúne duas coisas na mesma tela:

- **Indicadores da frota**: cartões com total de reservas, ocupantes médios
  por viagem, aproveitamento de lugares, percentual de viagens com carona e
  tamanho da frota ativa, além das rotas e veículos mais usados;
- **Lista operacional de reservas**: filtro por local, veículo, data e
  "somente com observações/avarias ou fotos registradas", separada em
  Ativas/Concluídas, com botão para criar uma reserva em nome de outra
  pessoa ("Nova reserva como admin/gestão") e para editar/cancelar qualquer
  reserva.

### 10.2 Locais

Cadastro dos locais/filiais onde a frota fica baseada: adicionar, editar,
ativar/desativar ou excluir definitivamente (com justificativa — só é
possível se não houver veículo vinculado nem reserva ativa envolvendo o
local).

### 10.3 Veículos

Cadastro da frota: local, placa, marca, modelo, capacidade, tipo (carro, van
ou ônibus), centro de custo, se é próprio ou alugado, e o odômetro atual
(atualizado automaticamente a cada retirada/devolução, mas editável aqui
para corrigir uma divergência real). Também permite ativar/desativar ou
excluir definitivamente um veículo (com justificativa).

### 10.4 Bloqueios

Impede reservas em um veículo durante um período — por manutenção, revisão,
documentação ou indisponibilidade. Basta escolher o veículo, o motivo, o
período e uma observação.

### 10.5 Manutenção

Lembretes preventivos por veículo: tipo de manutenção, e quando ela vence
(por quilometragem rodada e/ou por data — o que vencer primeiro dispara o
aviso, tanto na tela quanto por e-mail). A lista destaca o que já venceu ou
está perto de vencer.

### 10.6 Auditoria

Histórico completo de ações realizadas no sistema (quem fez o quê e
quando): criação/edição/cancelamento de reserva, entrada/saída de carona,
retirada/devolução, alterações de cadastro, exclusões, mudanças de regras e
exportações. Pode ser filtrado por usuário, ação e período, e exportado em
Excel ou PDF.

### 10.7 Relatórios

Tela de análise e exportação, separada da lista operacional de "Reservas".
Filtre por local, veículo, usuário e período, veja o resumo (total de
reservas, concluídas, quilômetros rodados, usuários envolvidos) e exporte
em Excel ou PDF — o PDF traz uma visão geral das reservas e uma segunda
tabela com o detalhe de retirada/devolução de cada uma.

### 10.8 Regras

Parâmetros globais que valem para todo mundo: duração máxima por reserva,
antecedência máxima para reservar, quantas reservas cada usuário pode ter
ativas ao mesmo tempo, intervalo mínimo de segurança entre reservas do mesmo
veículo e antecedência permitida para registrar a retirada.

### 10.9 Integrações

Configurações que, uma vez preenchidas aqui, têm prioridade sobre as
variáveis do arquivo `.env` do servidor:

- **Login via Microsoft**: dados do App Registration usado para o SSO e a
  importação de usuários corporativos;
- **E-mail**: como o CapriCar envia as notificações por e-mail. Duas opções:
  um servidor SMTP tradicional (host, porta, usuário e senha), ou enviar
  como uma caixa do Microsoft 365 usando o mesmo login configurado acima
  (sem senha nenhuma — útil quando a conta tem autenticação em duas etapas
  e a senha normal não funciona para SMTP). Com botão de teste;
- **Lembretes por e-mail**: liga/desliga e edita o texto de cada modelo de
  e-mail automático, com pré-visualização e um botão para disparar o envio
  manualmente sem esperar a rotina periódica;
- **Calendário (Outlook)**: liga/desliga a criação automática de um evento
  no Outlook para cada reserva, com botão de teste.

### 10.10 Usuários

Cadastro de contas: criar, editar, conceder/revogar as permissões acima uma
a uma, importar usuários do Microsoft Entra ID em massa, buscar/filtrar por
permissão, aplicar ações em lote (desativar, excluir ou ajustar permissões
de vários usuários de uma vez) e consultar a CNH de qualquer usuário. A
conta principal de administrador não pode ser desativada nem excluída, e
uma conta de administrador só pode ser editada por outro administrador.

## 11. Dúvidas comuns

**Minha reserva não deixa avançar da primeira etapa.**
Confira a mensagem de erro perto do campo destacado — normalmente é
veículo/local/data faltando, um conflito de horário com outra reserva, um
bloqueio no período ou uma CNH incompatível com o veículo escolhido.

**Não consigo ver a aba Admin/Gestão.**
Ela só aparece para quem é administrador ou tem pelo menos uma permissão de
gestão concedida. Peça ao administrador para verificar suas permissões
(seção 10.10).

**Registrei uma quilometragem errada por engano.**
Se for menor que o esperado, o próprio sistema já pergunta se você confirma
mesmo assim (seção 7) — não é preciso cancelar nada. Se precisar corrigir o
odômetro do veículo depois, quem tem a permissão de veículos pode editar o
campo "odômetro atual" no cadastro dele (seção 10.3).

**Minha CNH está vencendo/venceu.**
Atualize em "Meu perfil" (seção 8). Enquanto estiver vencida, não é possível
criar reservas como motorista.

**Não recebo e-mail de notificação.**
O envio de e-mail depende de o administrador ter configurado o SMTP na aba
Integrações (seção 10.9). Sem essa configuração, as notificações continuam
funcionando normalmente dentro do sistema (sino de notificações), só o
e-mail é que não sai.
