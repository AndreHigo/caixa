# Implantação do Meu Caixa em VPS

O Compose de produção sobe o app e um PostgreSQL privado. O banco não publica portas; o app escuta em `127.0.0.1:3000` para um proxy HTTPS na própria VPS. O arquivo Compose local `compose.yaml` continua reservado ao PostgreSQL de desenvolvimento na porta 5434.

## Preparar

Instale Docker Engine e o plugin Docker Compose na VPS. Clone o repositório, entre na pasta e crie o arquivo de ambiente:

```sh
cp .env.production.example .env.production
```

Edite `.env.production`. Gere uma senha hexadecimal aleatória para o PostgreSQL e outra chave independente para `JWT_SECRET`:

```sh
openssl rand -hex 32
```

Use a senha do PostgreSQL tanto em `POSTGRES_PASSWORD` quanto no trecho correspondente de `DATABASE_URL`. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo de 14 caracteres) e `APP_ORIGIN` com o domínio HTTPS real. Não publique `.env.production` no Git.

## Subir

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 app
```

Na primeira inicialização, o app valida os segredos, aplica as migrações e inicia. O primeiro login usa o e-mail e a senha de `ADMIN_EMAIL` e `ADMIN_PASSWORD`; o usuário é criado nesse primeiro acesso. Não execute `npm run db:seed` em produção.

Configure Caddy, Nginx ou outro proxy para encaminhar o domínio HTTPS a `127.0.0.1:3000`, com certificado TLS válido. Libere publicamente somente as portas 80 e 443 da VPS. O `APP_ORIGIN` precisa ser exatamente a origem pública, por exemplo `https://caixa.seudominio.com`.

## Open Finance

As chaves `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` são opcionais para iniciar o app. Sem elas, a tela Bancos informa que a conexão está desativada. Para conectar, preencha ambas e reinicie o serviço:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d app
```

Para atualizações automáticas, configure `PLUGGY_WEBHOOK_SECRET` e `BANK_SYNC_SECRET` com segredos aleatórios de pelo menos 32 caracteres, cadastre `https://SEU-DOMINIO/api/banks/webhook` no painel Pluggy e configure o agendador para chamar `POST /api/banks/sync` com `Authorization: Bearer <BANK_SYNC_SECRET>`. O provedor e o consentimento do banco continuam necessários.

## Operação e dados

- O volume `meu-caixa-prod-postgres-data` guarda os dados entre reinicializações e atualizações do app.
- Faça backup frequente do PostgreSQL e teste a restauração antes de confiar nele como cópia de segurança.
- Atualizar a imagem não migra os dados locais do computador para a VPS. A importação do banco existente deve ser feita como uma operação separada, com backup validado.
- Para atualizar o app, publique/obtenha o commit desejado e rode novamente o comando `up -d --build` acima.
- Confira `docker compose ... ps` e os logs após cada atualização. `healthy` confirma resposta HTTP do app, não sincronização com banco financeiro.
