# CapriCar no AKS — passo a passo

## 1. Criar os recursos no Azure

```bash
# Variáveis - ajuste os nomes
RG=capricar-rg
LOCATION=brazilsouth
ACR=capricarregistry          # precisa ser único globalmente
AKS=capricar-aks
DB=capricar-db                # precisa ser único globalmente

az group create -n $RG -l $LOCATION

# Registro de imagens
az acr create -n $ACR -g $RG --sku Basic

# Cluster AKS (1 node pool pequeno pra começar)
az aks create -n $AKS -g $RG --node-count 1 --node-vm-size Standard_B2s --generate-ssh-keys
az aks update -n $AKS -g $RG --attach-acr $ACR

# Banco gerenciado - troque a senha do admin
az postgres flexible-server create -n $DB -g $RG -l $LOCATION \
  --admin-user capricar_admin --admin-password "SENHA-FORTE-AQUI" \
  --sku-name Standard_B1ms --tier Burstable --version 18 \
  --storage-size 32 --public-access 0.0.0.0-255.255.255.255
  # "public-access" liberado assim é só pra simplificar a 1ª configuração -
  # depois disso, restrinja as regras de firewall só ao IP de saída do AKS
  # (ou melhor ainda, integração de rede virtual).

# Cria o banco "capricar" e o usuário da aplicação dentro do Flexible Server
az postgres flexible-server db create -g $RG -s $DB -d capricar
```

Depois disso, conecta no Flexible Server (`psql` ou até o painel do Azure)
como `capricar_admin` e cria o usuário da aplicação, do jeito que já existe
localmente:
```sql
CREATE USER capricar_app WITH PASSWORD 'outra-senha-forte';
GRANT ALL PRIVILEGES ON DATABASE capricar TO capricar_app;
```

## 2. Buildar e publicar a imagem

```bash
az acr build --registry $ACR --image capricar:latest .
```
(roda o build direto na nuvem, não precisa de Docker instalado na sua máquina)

## 3. Migrar os dados existentes

Com `PGSSLMODE=require` (exigido pela Azure) e apontando pro Flexible Server:

```powershell
$env:PGHOST="$DB.postgres.database.azure.com"
$env:PGPORT="5432"
$env:PGUSER="capricar_app"
$env:PGDATABASE="capricar"
$env:PGSSLMODE="require"
npm run db:restore -- backups\SEU-BACKUP.backup --confirm=capricar
Remove-Item Env:\PGHOST, Env:\PGPORT, Env:\PGUSER, Env:\PGDATABASE, Env:\PGSSLMODE
```

## 4. Aplicar os manifests

```bash
kubectl apply -f 00-namespace.yaml
kubectl apply -f 10-configmap.yaml
# Preencha 20-secret.example.yaml com os valores reais, salve como
# 20-secret.yaml (fora do Git) e aplique:
kubectl apply -f 20-secret.yaml
kubectl apply -f 30-pvc-uploads.yaml
kubectl apply -f 31-pvc-backups.yaml
kubectl apply -f 40-deployment.yaml
# Instale ingress-nginx e cert-manager (ver comentários no topo do arquivo)
# antes deste último:
kubectl apply -f 50-ingress.yaml
```

## 5. Migrar as fotos existentes

As fotos em `server/uploads/` na sua máquina não vão por Git nem pelo
restore do banco - copie manualmente pro PVC depois que o pod já estiver de
pé, por exemplo com `kubectl cp`:
```bash
kubectl cp C:\CapriCar\server\uploads\. capricar/<nome-do-pod>:/app/server/uploads -n capricar
```

## 6. Atualizar o Entra ID

No Azure Portal, no App Registration usado pelo CapriCar, adiciona
`https://SUBSTITUA.seudominio.com/api/auth/sso/callback` na lista de Redirect
URIs. Depois, no Painel de Administração do próprio CapriCar (Integrações),
atualiza a URL de redirecionamento pra mesma coisa.

## 7. Conferir

```bash
kubectl get pods -n capricar
kubectl logs -n capricar deploy/capricar-app
kubectl get ingress -n capricar   # confirma o IP público / status do certificado
```

Acesse `https://SUBSTITUA.seudominio.com` e testa o login com Entra ID.
