# Status das funcionalidades

Legenda: ✅ funciona e foi verificado · 🧪 implementado e coberto por testes automatizados, mas não executado de ponta a ponta · 🔒 bloqueado por credenciais/ambiente · ⏳ pendente

Verificação feita em 29/10/2026: `npm run check` (tsc + ESLint + 79 testes Vitest + `deno check` das 5 Edge Functions) passando, build web de produção (`expo export`) gerado, e navegação manual na versão web (desktop e 375 px) em modo demonstração.

## Funciona (verificado no app web)

- ✅ Onboarding, escolha de modo (conta / local / demonstração) e faixa de modo permanente
- ✅ Painel: saudação, data, agenda do dia com status/duração/categoria/lembrete, resumos de tarefas, hábitos (sequência), treinos e finanças derivados dos dados, cartão do assistente com sugestões
- ✅ Barra inferior com botão central e ações rápidas (tarefa, compromisso, hábito, treino, movimentação, assistente)
- ✅ Agenda: dia, semana, mês (marcadores por dia), lista de próximos, pesquisa
- ✅ Compromissos: criar/editar/excluir, frase natural que preenche o formulário, duração ou término, dia inteiro, local, link, categoria, lembrete (inclui personalizado), recorrência (diária/semanal com dias/mensal/anual, intervalo), aviso de conflito (inclusive com séries), editar/excluir só a ocorrência ou toda a série
- ✅ Tarefas: criar/editar/concluir/desfazer/excluir, subtarefas, tags, prioridade, categoria, listas personalizadas, filtros, pesquisa, visão semanal, atrasadas, progresso diário e semanal, repetição (gera a próxima sem duplicar), converter em compromisso vinculado
- ✅ Hábitos: dias específicos ou X vezes por semana, meta diária, ícone, horário/lembrete, marcar/desfazer, calendário de consistência, sequências corretas (dias não programados e futuros não contam), estatísticas semana/mês, arquivar
- ✅ Treinos: rotinas com exercícios (grupo, séries, reps, carga, descanso, notas), programar na agenda, registrar sessão (pré-preenche com a última carga), repetir/copiar treino anterior, histórico, evolução por exercício, rascunho salvo automaticamente
- ✅ Finanças: contas com saldo inicial, receitas/despesas/transferências, forma de pagamento, recorrência mensal idempotente, saldo e totais derivados, comparação com mês anterior, distribuição por categoria, filtros por período/tipo/categoria, metas com aportes/retiradas
- ✅ Assistente (interpretador local): prévia editável, confirmação explícita, distinção visual sugestão × salvo, perguntas quando falta horário/valor/qual evento, conflito antes de confirmar, remarcar/cancelar evento, consultas (dia, tarefas, gastos, saldo, horários livres, hábitos), histórico persistido
- ✅ Configurações: perfil, fuso horário, início da semana, preferências de notificação por categoria, dados e privacidade (exportar JSON, apagar dados locais, sair da demonstração)
- ✅ Persistência local (sobrevive a recarregar), estados vazios, carregamento, erros com reversão, confirmações de exclusão, rótulos de acessibilidade, layout responsivo sem rolagem horizontal

## Implementado, não executado de ponta a ponta

- 🧪 Esquema PostgreSQL, RLS e restrições — executados num Postgres embutido (PGlite) com as migrações reais, mas ainda não num projeto Supabase
- 🧪 Login, cadastro, confirmação de e-mail, recuperação e redefinição de senha (Supabase Auth) — código pronto; requer projeto Supabase
- 🧪 Repositório Supabase (CRUD com filhos: subtarefas, exercícios, séries, aportes) — mapeamento testado; requer projeto
- 🧪 Notificações locais no Android/iOS — plano e reconciliação testados; agendamento real requer celular
- 🧪 Gravação de voz (expo-audio) e reconhecimento de voz do navegador — requer microfone/celular

## Bloqueado por credenciais

- 🔒 Assistente com IA (Claude) — função `assistant` pronta; requer `ANTHROPIC_API_KEY` e Supabase
- 🔒 Transcrição de voz no servidor — função `transcribe` pronta; requer `TRANSCRIPTION_API_KEY`
- 🔒 Google Agenda (OAuth, importação, envio, incremental, conflitos) — requer projeto Google Cloud + Supabase (passo a passo em `google-calendar.md`)
- 🔒 Exclusão de conta no servidor — função pronta; requer Supabase
- 🔒 Token de push remoto — requer `EXPO_PUBLIC_EAS_PROJECT_ID`

## Pendente

- ⏳ Testes automatizados de interface (React Native Testing Library) — a interface foi verificada manualmente no navegador
- ⏳ Tema claro (o tema escuro é o padrão e único por enquanto)
- ⏳ Sincronização automática periódica com o Google (hoje: ao conectar e pelo botão)
- ⏳ Edição de recorrência "esta e as seguintes"; recorrência de despesas além de mensal na interface (o domínio já suporta)
- ⏳ Modo offline com fila de reenvio para a conta Supabase (hoje a gravação exige conexão e é revertida com aviso se falhar)
- ⏳ Integração bancária (fora do escopo da v1, estrutura preparada em `finance_accounts.provider`)

## O que você precisa configurar

1. Projeto Supabase → `.env` com URL e anon key → `npx supabase db push` → URLs de redirecionamento do Auth.
2. Segredos das funções (`supabase/functions/.env`): `ANTHROPIC_API_KEY`, `TRANSCRIPTION_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` → `supabase secrets set` → deploy das funções.
3. Google Cloud: Calendar API, tela de consentimento, cliente OAuth Web com o redirect da função → `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
4. (Opcional) `pg_cron` para a rotina de retenção; conta Expo/EAS para builds e push.
