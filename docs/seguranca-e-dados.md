# Segurança, privacidade e dados

## Banco de dados

Migrações versionadas em `supabase/migrations` (aplicadas em ordem):

| Migração | Conteúdo |
|---|---|
| `…0001_foundation` | `profiles` (preferências, fuso, notificações), trigger que cria o perfil no cadastro, função `nl_apply_owner_policies` |
| `…0002_agenda_tasks` | `events`, `task_lists`, `tasks`, `subtasks` |
| `…0003_habits_workouts` | `habits`, `habit_logs`, `workout_routines`, `routine_exercises`, `workout_sessions`, `session_sets` |
| `…0004_finance` | `finance_accounts`, `transactions`, `recurring_transactions`, `savings_goals`, `goal_contributions` |
| `…0005_integrations_assistant` | `integrations`, `integration_secrets`, `sync_conflicts`, `push_tokens`, `assistant_messages`, `assistant_usage`, limite de uso e retenção |

### Controle de acesso

- **RLS habilitado e forçado em todas as tabelas.** Política padrão: o usuário só lê, cria, altera e apaga linhas em que `user_id = auth.uid()`. O `WITH CHECK` impede gravar com `user_id` de outra pessoa (o valor enviado pelo cliente não é confiado).
- **Integridade entre tabelas por usuário:** chaves estrangeiras compostas `(id, user_id)` impedem, por exemplo, criar uma subtarefa numa tarefa de outro usuário.
- `integration_secrets` tem RLS **sem nenhuma política** e sem permissões para `anon/authenticated`: nem o dono lê os tokens pela API.
- `increment_assistant_usage` e `purge_old_assistant_data` são `security definer` com `search_path` vazio e sem `EXECUTE` para clientes.
- Tudo isso é verificado em `tests/db-rls.test.ts` aplicando as migrações reais num PostgreSQL embutido.

### Validação

- Frontend: validação de formulários (`validateEventDraft`, `validateTransaction`, máscaras de data/hora/valor).
- Banco: `CHECK` em tamanhos de texto, categorias, valores positivos, intervalos de data, `UNIQUE` contra duplicidade (um registro de hábito por dia, um lançamento recorrente por data, um evento por id externo).
- Edge Functions: `zod` em todas as entradas; o usuário vem sempre do JWT verificado.

## Segredos

- O app recebe apenas `EXPO_PUBLIC_SUPABASE_URL` e a chave **anon** (pública por definição).
- Chaves da Anthropic, do serviço de transcrição, do Google OAuth, a chave de cifra e o segredo do `state` existem só nas Edge Functions (`supabase secrets`).
- Tokens do Google são cifrados com AES-256-GCM antes de gravar.
- Logs das funções registram só tipo/mensagem de erro, nunca tokens, corpos de requisição ou dados do usuário.

## Assistente e voz

- A IA só usa ferramentas definidas no servidor. Leituras passam pelo RLS com limites de período/quantidade; operações que alteram dados **não executam**: geram propostas validadas que o usuário confirma.
- Resultados de ferramentas e históricos são tratados como dados (proteção contra *prompt injection* no system prompt), e mesmo uma injeção bem-sucedida só conseguiria **propor** algo que o usuário vê antes de confirmar.
- Limite diário por usuário (`ASSISTANT_DAILY_LIMIT`, `TRANSCRIPTION_DAILY_LIMIT`), contado atomicamente no banco.
- **Áudio não é armazenado**: é repassado ao serviço de transcrição e descartado. A transcrição vira uma mensagem normal do chat.

## Retenção e exclusão

- Histórico do assistente: 90 dias; contadores de uso: 30 dias; conflitos resolvidos: 30 dias. Agende a limpeza: `select cron.schedule('nl-retention', '0 4 * * *', 'select public.purge_old_assistant_data()');` (extensão `pg_cron`).
- **Excluir conta** (*Dados e privacidade*): a função `delete-account` revoga o acesso ao Google e apaga o usuário; todas as tabelas usam `ON DELETE CASCADE`.
- **Exportar dados**: JSON com todos os registros do usuário.
- Modo local: dados só no aparelho, com opção de apagar; podem ser importados para a conta depois.

## Backup e recuperação

- **Supabase gerenciado:** backups diários automáticos (planos pagos) e *Point-in-Time Recovery* opcional. Restauração pelo painel em *Database › Backups*.
- **Backup lógico manual:**

```bash
npx supabase db dump --data-only -f backup-dados.sql
```

```bash
npx supabase db dump -f backup-esquema.sql
```

- **Restauração:** crie um projeto, aplique as migrações (`npx supabase db push`) e importe os dados com `psql "$DATABASE_URL" -f backup-dados.sql`.
- Teste a restauração periodicamente num projeto separado.
