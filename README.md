# Northline

> Organize sua rotina. Evolua todos os dias.

App de organização pessoal que reúne **agenda inteligente, tarefas, hábitos, treinos e finanças** num painel só, com um **assistente por texto e voz** que sempre mostra uma prévia e só grava depois da sua confirmação.

- **App:** React Native + Expo SDK 58 + Expo Router + TypeScript (Android, iOS e web/PWA a partir do mesmo código)
- **Backend:** Supabase (Auth, PostgreSQL com RLS, Edge Functions em Deno)
- **IA:** Claude (Anthropic) com ferramentas controladas; transcrição por serviço compatível com `/v1/audio/transcriptions`
- **Integrações:** Google Calendar (OAuth 2.0 pelo backend, sincronização incremental), notificações locais (Expo Notifications)

Documentação detalhada em [`docs/`](docs):
[arquitetura](docs/arquitetura.md) · [status das funcionalidades](docs/status.md) · [Google Agenda](docs/google-calendar.md) · [notificações](docs/notificacoes.md) · [segurança e dados](docs/seguranca-e-dados.md) · [publicação](docs/publicacao.md)

---

## 1. Rodar agora (sem configurar nada)

Requisitos: Node 20+ (testado com Node 24).

```bash
npm install
```

```bash
npm run web
```

Abra http://localhost:8081. Sem Supabase configurado o app oferece:

- **Usar sem conta**: seus dados reais ficam só no aparelho/navegador (armazenamento local).
- **Explorar com dados de demonstração**: dados fictícios num espaço separado, com faixa "DEMONSTRAÇÃO" fixa no topo.

Nos dois modos o assistente usa o **interpretador local** (regras determinísticas para português) em vez de IA, e a interface informa isso.

## 2. Rodar no celular

1. Instale o **Expo Go** (Android/iOS).
2. No computador:

```bash
npx expo start
```

3. Escaneie o QR code (Android: pelo Expo Go; iPhone: pela câmera). Celular e computador precisam estar na mesma rede (ou use `npx expo start --tunnel`).

> Notificações agendadas e gravação de voz funcionam no Expo Go. Para notificações **push remotas** e para publicar, gere uma *development build* com EAS (veja [publicação](docs/publicacao.md)).

## 3. Conectar o backend (Supabase)

1. Crie um projeto em https://supabase.com e copie `Project URL` e `anon public key`.
2. Copie `.env.example` para `.env` e preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Aplique as migrações:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

4. Em *Authentication › URL Configuration*, adicione as URLs de redirecionamento: `northline://**`, `exp://**` e `http://localhost:8081/**`.
5. Publique as Edge Functions e os segredos:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

```bash
npx supabase functions deploy assistant transcribe google-sync delete-account
```

```bash
npx supabase functions deploy google-oauth --no-verify-jwt
```

O arquivo `supabase/functions/.env` deve conter os segredos listados na segunda metade de `.env.example` (chave da Anthropic, transcrição, Google, `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`). **Nunca** coloque esses valores no `.env` do app.

Ambiente local completo (requer Docker): `npx supabase start` sobe Postgres/Auth/Functions e `npx supabase db reset` aplica migrações + `supabase/seed.sql` (usuário de desenvolvimento `demo@northline.dev` / `northline-demo`).

## 4. Testes e verificações

```bash
npm run check
```

Executa, em ordem: `typecheck` (tsc), `lint` (ESLint/Expo), `test` (Vitest) e `check:functions` (deno check das Edge Functions).

| Suíte | O que cobre |
|---|---|
| `tests/nlp.test.ts` | Datas relativas em pt-BR (hoje, amanhã, sexta, próxima segunda, daqui a 2 horas, fim do mês, toda terça), horários, durações, títulos, intenções e valores |
| `tests/domain.test.ts` | Fuso horário e horário de verão, recorrência, validação/conflitos de eventos, sequências de hábitos, finanças em centavos, tarefas recorrentes, plano de notificações, treinos |
| `tests/db-rls.test.ts` | Aplica as **migrações reais** num PostgreSQL embutido (PGlite) e verifica RLS entre usuários, user_id forjado, tokens inacessíveis, unicidade, cascata na exclusão de conta e limite de uso |
| `tests/integration.test.ts` | Assistente local (prévia, ambiguidade, conflito, remarcação), mapeamento app↔Postgres e regras de sincronização com o Google |

## 5. Estrutura

```
src/
  app/            telas (Expo Router): (auth), (app)/(tabs), agenda, event, task, habit, workouts, finance, assistant, settings
  components/     sistema de design (ui/), marca, linhas, cartões de proposta
  domain/         regras de negócio puras e testadas (datas, NLP, recorrência, hábitos, finanças, notificações)
  data/           repositórios (local e Supabase), mapeamento, dados de demonstração
  state/          estado global (zustand) e ações de negócio
  services/       assistente, voz, Google, notificações
  theme/          tokens de cor, tipografia, espaçamento
supabase/
  migrations/     esquema versionado com RLS
  functions/      assistant, transcribe, google-oauth, google-sync, delete-account (+ _shared)
  seed.sql        dados só para desenvolvimento local
tests/            Vitest
docs/             documentação
```
