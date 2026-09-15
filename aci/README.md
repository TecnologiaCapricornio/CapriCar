# CapriCar no Azure Container Instances (ACI)

## 1. Recursos básicos

```bash
RG=capricar-rg
LOCATION=brazilsouth
ACR=capricarregistry     # único globalmente
DB=capricar-db           # único globalmente
STORAGE=capricarstorage  # único globalmente, só letras minúsculas/números

az group create -n $RG -l $LOCATION

# Registro de imagens
az acr create -n $ACR -g $RG --sku Basic

# Banco gerenciado (mesmo comando de antes, independe de ser AKS ou ACI)
az postgres flexible-server create -n $DB -g $RG -l $LOCATION \
  --admin-user capricar_admin --admin-password "SENHA-FORTE-AQUI" \
  --sku-name Standard_B1ms --tier Burstable --version 18 \
  --storage-size 32 --public-access 0.0.0.0-255.255.255.255
az postgres flexible-server db create -g $RG -s $DB -d capricar
```

Depois, conecta como `capricar_admin` e cria o usuário da aplicação (mesmo
`CREATE USER` / `GRANT` de sempre).

## 2. Buildar a imagem

```bash
az acr build --registry $ACR --image capricar:latest .
```

## 3. Storage para as fotos (equivalente ao volume do Compose)

ACI monta Azure Files diretamente, sem precisar de PVC/Kubernetes:

```bash
az storage account create -n $STORAGE -g $RG -l $LOCATION --sku Standard_LRS
KEY=$(az storage account keys list -n $STORAGE -g $RG --query '[0].value' -o tsv)
az storage share create --name capricar-uploads --account-name $STORAGE --account-key $KEY
az storage share create --name capricar-backups --account-name $STORAGE --account-key $KEY
```

## 4. Migrar os dados existentes

Mesmo processo de sempre, apontando pro Flexible Server (precisa de
`PGSSLMODE=require`, que a Azure exige):

```powershell
$env:PGHOST="$DB.postgres.database.azure.com"
$env:PGPORT="5432"
$env:PGUSER="capricar_app"
$env:PGDATABASE="capricar"
$env:PGSSLMODE="require"
npm run db:restore -- backups\SEU-BACKUP.backup --confirm=capricar
Remove-Item Env:\PGHOST, Env:\PGPORT, Env:\PGUSER, Env:\PGDATABASE, Env:\PGSSLMODE
```

## 5. Migrar as fotos existentes

Direto pro Azure File Share, sem precisar do container no ar ainda:

```bash
az storage file upload-batch \
  --destination capricar-uploads \
  --source "C:\CapriCar\server\uploads" \
  --account-name $STORAGE --account-key $KEY
```

## 6. Subir o container

Preencha `container-group.yaml` (PGHOST, storageAccountName/Key, credenciais
do ACR) e crie:

```bash
ACR_PASSWORD=$(az acr credential show -n $ACR --query 'passwords[0].value' -o tsv)
az container create -g $RG --file container-group.yaml
```

Ou, se preferir tudo por linha de comando em vez do YAML (as senhas ficam
como "secure", não aparecem em `az container show`):

```bash
az container create -g $RG -n capricar \
  --image $ACR.azurecr.io/capricar:latest \
  --registry-login-server $ACR.azurecr.io \
  --registry-username $ACR --registry-password $ACR_PASSWORD \
  --cpu 1 --memory 1 \
  --ports 3000 --dns-name-label capricar-SUBSTITUA \
  --os-type Linux --restart-policy OnFailure \
  --azure-file-volume-share-name capricar-uploads \
  --azure-file-volume-account-name $STORAGE \
  --azure-file-volume-account-key $KEY \
  --azure-file-volume-mount-path /app/server/uploads \
  --environment-variables PORT=3000 NODE_ENV=production HOST=0.0.0.0 \
    PGHOST=$DB.postgres.database.azure.com PGPORT=5432 PGDATABASE=capricar \
    PGUSER=capricar_app PGSSLMODE=require SESSION_COOKIE_SECURE=true \
  --secure-environment-variables PGPASSWORD='SENHA-DO-CAPRICAR-APP' \
    SETTINGS_ENCRYPTION_KEY='MESMA-CHAVE-DO-SEU-ENV-ATUAL'
```
(o volume de `backups` fica de fora desse comando de exemplo porque o CLI só
aceita um volume Azure File por vez direto na linha de comando - use o
YAML se quiser os dois volumes montados.)

Isso te dá um endereço público tipo
`http://capricar-SUBSTITUA.brazilsouth.azurecontainer.io:3000` — sem HTTPS
ainda.

## 7. HTTPS e domínio próprio

Diferente do App Service, o ACI não dá certificado nem domínio de graça. O
caminho mais simples é colocar o **Azure Front Door** na frente dele
(gerencia HTTPS automaticamente e aceita domínio próprio), apontando o
"origin" pro endereço `*.azurecontainer.io:3000` de cima. Se preferir, um
Application Gateway faz o mesmo papel. Me avisa quando chegar nessa parte
que eu detalho os comandos.

## 8. Atualizar o Entra ID

No Azure Portal, no App Registration, adiciona a URL final (com HTTPS, via
Front Door) como Redirect URI. Atualiza a mesma URL no Painel de
Administração do CapriCar.

## 9. Conferir

```bash
az container logs -g $RG -n capricar
az container show -g $RG -n capricar --query 'instanceView.state'
```
