# Notificações e lembretes

## O que é implementado

- **Notificações locais** (Expo Notifications) para compromissos/reuniões, tarefas com prazo, hábitos com horário e treinos programados.
- Lembretes configuráveis: no horário, 5, 10, 30 minutos, 1 hora, 1 dia antes ou **personalizado** (em minutos, até 7 dias).
- Permissão solicitada no momento em que faz sentido (ao ativar um lembrete ou em *Configurações › Notificações*), com canal Android "Lembretes" (alta importância).
- Ativar/desativar **por categoria** (eventos, tarefas, hábitos, treinos) e lembrete padrão para novos compromissos.
- **Sem duplicatas e sempre atualizadas:** `planNotifications()` (função pura, testada) calcula o conjunto desejado com ids determinísticos (hash de item + conteúdo + horário). `syncNotifications()` compara com o que está agendado no aparelho, cancela o que não existe mais (evento alterado, removido, tarefa concluída, hábito feito) e agenda apenas o que falta. Roda automaticamente sempre que os dados mudam e ao abrir o app.
- Horários calculados no fuso do usuário/evento, incluindo regras de horário de verão (testado com America/New_York).
- Tocar na notificação abre a área correspondente.
- **Central de lembretes** (sino no painel) lista o que será lembrado nos próximos 7 dias.
- Registro do token de push (`push_tokens`) quando há `EXPO_PUBLIC_EAS_PROJECT_ID` e conta conectada — base para notificações remotas.

## Limitações por plataforma

| Plataforma | Comportamento |
|---|---|
| iOS | Máximo de 64 notificações locais pendentes por app. O Northline agenda no máximo 60, cobrindo os próximos 7 dias, e reagenda ao abrir o app. Notificações agendadas sobrevivem a reinicializações. |
| Android | Notificações agendadas por `AlarmManager`; o Expo reagenda após reiniciar o aparelho. Modos de economia de bateria e fabricantes agressivos (Xiaomi, Samsung etc.) podem atrasar a entrega. Android 13+ exige a permissão `POST_NOTIFICATIONS` (já declarada). |
| Web | Não usa notificações do sistema. A central de lembretes mostra o plano; para avisos no computador, use o app ou o Google Agenda. |
| Expo Go | Notificações locais funcionam. Push remoto requer development build (EAS). |

O app **não promete entrega no segundo exato**: o sistema operacional decide o momento final.

## Notificações remotas (opcional)

A tabela `push_tokens` e o registro seguro (RLS, um token por aparelho) já existem. Lembretes não precisam de push remoto, pois são calculados no aparelho. Um envio remoto (ex.: resumo diário) exigiria uma Edge Function agendada chamando a API de push da Expo com esses tokens.
