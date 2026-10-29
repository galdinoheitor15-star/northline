# Arquitetura e decisões técnicas

## Visão geral

```
┌──────────── App (Expo / React Native / web) ────────────┐
│ Interface (src/app, src/components)                      │
│   ↓ usa                                                  │
│ Estado + ações de negócio (src/state)                    │
│   ↓ regras puras                ↓ persistência           │
│ Domínio (src/domain)        Repositório (src/data)       │
│                               ├─ LocalRepository (AsyncStorage)
│                               └─ SupabaseRepository ──────────┐
│ Serviços (src/services): assistente, voz, Google, notificações │
└───────────────────────────────────────────────────────────────┘
                                                                ↓ JWT do usuário
┌──────────── Supabase ───────────────────────────────────────────┐
│ Auth · PostgreSQL com RLS (supabase/migrations)                  │
│ Edge Functions (Deno): assistant · transcribe · google-oauth ·   │
│                        google-sync · delete-account              │
└──────────────────────────────────────────────────────────────────┘
        ↓ segredos só aqui              ↓                 ↓
   Anthropic (Claude)     Serviço de transcrição    Google Calendar API
```

Separação pedida no projeto:

| Camada | Onde |
|---|---|
| Interface | `src/app`, `src/components`, `src/theme` |
| Estado e lógica de negócio | `src/state` (zustand + ações), `src/domain` (regras puras) |
| Camada de dados | `src/data` (contrato `Repository` com implementações local e Supabase) |
| Serviços de IA | `src/services/assistant.ts`, `src/domain/assistant-local.ts`, `supabase/functions/assistant` |
| Integrações externas | `src/services/google.ts`, `supabase/functions/google-*` |
| Autenticação e autorização | `src/state/session.ts`, Supabase Auth, RLS nas migrações, `_shared/auth.ts` |
| Notificações | `src/domain/notifications-plan.ts` (plano puro), `src/services/notifications.ts` |

## Decisões

1. **Um só código para Android, iOS e web.** Expo + react-native-web. A versão web é uma SPA (`web.output = "single"`) instalável como PWA; não há arquitetura duplicada. Diferenças da web: sem notificações locais do sistema (a central de lembretes mostra o plano), voz usa o reconhecimento do navegador quando não há backend, e o OAuth do Google abre em nova janela.
2. **Domínio puro e testável.** Datas, recorrência, sequências, finanças, conflitos e o plano de notificações são funções puras sem dependência de React Native — por isso rodam no Vitest e são reutilizadas pelo assistente local.
3. **Datas e fusos.** Instantes em UTC (`timestamptz`); datas de calendário como `yyyy-mm-dd`; aritmética de calendário em UTC puro para não sofrer com horário de verão; conversão local↔UTC com `@date-fns/tz`. Fuso padrão `America/Recife`, alterável no perfil; cada evento guarda o próprio fuso.
4. **Dinheiro em centavos inteiros** (`bigint` no banco, `number` inteiro no app). Texto digitado é convertido sem ponto flutuante (`parseMoneyToCents`). Saldos são sempre derivados dos lançamentos.
5. **IDs gerados no cliente (UUID v4).** Permitem atualização otimista e o mesmo id no aparelho e no banco.
6. **Atualização otimista com reversão.** A tela muda na hora; se o backend recusar (RLS, constraint, rede), o estado volta e um aviso aparece.
7. **Três modos de sessão.** `supabase` (conta real), `local` (dados reais só no aparelho) e `demo` (dados fictícios em namespace separado, com faixa permanente). Nada é simulado silenciosamente: a interface sempre indica o modo.
8. **Assistente com duas engines.** Com conta: Claude via Edge Function com ferramentas de leitura (RLS) e ferramentas de *proposta* que nunca gravam. Sem conta ou em falha: interpretador local determinístico, e a mensagem informa qual engine respondeu.
9. **Ações confirmadas pelo usuário.** Toda proposta aparece como "Sugestão · não salvo" (contorno tracejado). Só depois do clique em confirmar e da gravação aceita ela vira "Salvo" (verde).
10. **Recorrência própria** (`freq/interval/byWeekday/until/count`), com exceções por ocorrência e eventos de substituição (`recurring_event_id`). Editar "só esta" desanexa a ocorrência; "toda a série" desloca a série.

## Bibliotecas (versões compatíveis com o SDK 58, instaladas via `npx expo install` quando nativas)

`expo-router` (navegação), `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-audio` (gravação), `expo-notifications`, `expo-web-browser` + `expo-linking` (OAuth), `expo-crypto` (UUID), `react-native-svg` + `lucide-react-native` (ícones), `@expo-google-fonts/inter`, `zustand`, `zod`, `date-fns` + `@date-fns/tz`. Testes: `vitest`, `@electric-sql/pglite`. Edge Functions: `@anthropic-ai/sdk@1.3.0`, `zod`, `@date-fns/tz`, `supabase-js`, verificadas com `deno check`.

## Modelo de IA

Padrão `claude-opus-5-5` com pensamento adaptativo e `effort: "low"` (respostas curtas e rápidas), configurável por `ANTHROPIC_MODEL`. As requisições usam `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) para reexecutar automaticamente pedidos recusados por classificadores em outro modelo recomendado.
