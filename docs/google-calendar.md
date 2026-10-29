# Integração com o Google Agenda

Status: **implementada, bloqueada por credenciais.** O código do fluxo OAuth, da sincronização incremental e da resolução de conflitos está pronto e verificado com `deno check`, e as regras de decisão têm testes. Ela só funciona depois dos passos abaixo — nada é simulado.

## 1. Configurar o Google Cloud

1. Acesse https://console.cloud.google.com e crie um projeto (ex.: "Northline").
2. *APIs e serviços › Biblioteca* → ative **Google Calendar API**.
3. *Tela de permissão OAuth*:
   - Tipo: Externo. Nome do app, e-mail de suporte, domínio (se houver).
   - Escopos: `.../auth/calendar.events`, `openid`, `email` (apenas estes).
   - Enquanto o app estiver em "Teste", adicione os e-mails que vão usar a integração em *Usuários de teste*. Para produção, envie para verificação do Google (o escopo `calendar.events` é sensível).
4. *Credenciais › Criar credenciais › ID do cliente OAuth*:
   - Tipo: **Aplicativo da Web** (o OAuth é intermediado pelo backend; o client secret nunca vai para o celular).
   - URI de redirecionamento autorizado: `https://SEU_PROJECT_REF.supabase.co/functions/v1/google-oauth`
5. Copie o **Client ID** e o **Client secret**.

## 2. Configurar o Supabase

Em `supabase/functions/.env` (não versionado):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=   # openssl rand -base64 32
OAUTH_STATE_SECRET=     # openssl rand -hex 32
ALLOWED_RETURN_URLS=http://localhost:8081/
```

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

```bash
npx supabase functions deploy google-oauth --no-verify-jwt
```

```bash
npx supabase functions deploy google-sync
```

## 3. Autorizar a conta

No app (logado): *Mais › Conexões › Conectar Google Agenda*. O navegador abre a tela de consentimento; ao concluir, o backend troca o código, **cifra os tokens (AES-256-GCM)** e grava em `integration_secrets` (tabela sem nenhuma política RLS: só a service role lê). Em seguida o app dispara a primeira sincronização.

## Como funciona

| Etapa | Implementação |
|---|---|
| Autorização | `google-oauth` (POST `start` → URL com `state` assinado por HMAC e validade de 10 min; GET callback → troca de código; POST `disconnect` → revoga no Google e apaga tokens) |
| Escopos | `calendar.events`, `openid`, `email` |
| Renovação | `accessToken()` renova com o refresh token 1 min antes de expirar |
| Revogação/expiração | `invalid_grant` → integração marcada "Acesso revogado", tokens apagados, app pede reconexão |
| Importação | `events.list` com `singleEvents=true`; primeira vez a partir de 30 dias atrás |
| Incremental | `nextSyncToken` salvo; **410 Gone** → sincronização completa automática (`fullResync`) |
| Duplicatas | índice único `(user_id, external_id)` + upsert |
| Envio | eventos com `sync_status = pending` → `insert`/`patch`/`delete` no Google |
| Exclusões | cancelamento local de evento sincronizado vira `status = cancelled` + `pending` e é propagado; exclusão no Google remove o local (se não houver edição local pendente) |
| Conflitos | se o evento mudou **dos dois lados** (etag remoto diferente e alteração local pendente) ou o `PATCH` com `If-Match` retorna **412**, nada é sobrescrito: o evento fica "Conflito" e aparece em *Conexões* para o usuário escolher "Manter Northline" ou "Manter Google" |
| Status | última sincronização, erro, conta conectada e conflitos em *Conexões*; badge de sincronização em cada evento |
| Repetir falhas | eventos com erro ficam `sync_status = error` e são exibidos; "Sincronizar agora" tenta de novo |

### Limitações conhecidas

- Sincroniza só a agenda principal (`primary`). Outras agendas: alterar `integrations.calendar_id`.
- Eventos recorrentes do Google chegam como ocorrências individuais (`singleEvents=true`). Séries criadas no Northline são enviadas como série (RRULE) e as instâncias que voltam do Google são ignoradas para não duplicar.
- Eventos locais criados **antes** de conectar não são enviados automaticamente (apenas os criados/alterados depois).
- A sincronização é disparada pelo usuário (botão) e após conectar. Sincronização automática periódica pode ser adicionada com um agendador (pg_cron chamando `google-sync`) ou com *push notifications* do Calendar (`events.watch`), que exigem domínio verificado.

## Lembretes: quem avisa o quê

- **Eventos criados no Northline:** o lembrete é uma notificação local do Northline. No Google o evento usa os lembretes padrão da sua agenda (`reminders.useDefault`). Se você não quer aviso duplicado, desative os lembretes padrão no Google ou defina "Sem lembrete" no Northline.
- **Eventos importados do Google:** chegam com "Sem lembrete" no Northline; quem avisa é o Google. Se você definir um lembrete aqui, receberá os dois.
