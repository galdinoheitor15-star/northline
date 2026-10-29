# Versão de teste e publicação nas lojas

Pré-requisitos: conta Expo (gratuita), e para lojas: Google Play Console (taxa única de US$ 25) e Apple Developer Program (US$ 99/ano).

## 1. Preparar o EAS

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build:configure
```

Isso cria `eas.json` e vincula o projeto (copie o `projectId` gerado para `EXPO_PUBLIC_EAS_PROJECT_ID` se quiser tokens de push). Identificadores já definidos em `app.json`: `app.northline.mobile` (Android e iOS) — troque se o domínio for outro.

Defina as variáveis públicas para os builds:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU_PROJECT_REF.supabase.co --environment production --visibility plaintext
```

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value SUA_ANON_KEY --environment production --visibility plaintext
```

## 2. Versão de teste

**Android (APK para instalar direto no celular):** em `eas.json`, no perfil `preview`, use `"android": { "buildType": "apk" }`, depois:

```bash
npx eas-cli@latest build --platform android --profile preview
```

O EAS devolve um link/QR para baixar o APK.

**iOS (TestFlight):**

```bash
npx eas-cli@latest build --platform ios --profile production
```

```bash
npx eas-cli@latest submit --platform ios
```

Depois convide testadores no App Store Connect › TestFlight.

**Development build** (para depurar com módulos nativos e push remoto):

```bash
npx eas-cli@latest build --profile development --platform android
```

## 3. Publicar

```bash
npx eas-cli@latest build --platform all --profile production
```

```bash
npx eas-cli@latest submit --platform android
```

```bash
npx eas-cli@latest submit --platform ios
```

Checklist das lojas:

- Política de privacidade publicada (o que é coletado: e-mail, dados que o usuário cadastra; áudio não armazenado; integração Google opcional). Base em `docs/seguranca-e-dados.md`.
- Formulário de *Data safety* (Play) e *App Privacy* (Apple) coerentes com a política.
- Exclusão de conta dentro do app — já implementada (exigência da Apple e do Google).
- Uso do microfone justificado (`NSMicrophoneUsageDescription` já em pt-BR).
- Verificação do Google OAuth para o escopo `calendar.events` antes de liberar a integração ao público.
- Capturas de tela (o modo demonstração ajuda a gerar telas sem dados reais).

## 4. Web / PWA

```bash
npm run build:web
```

Gera `dist/` estático (SPA). Publique em qualquer hospedagem estática (Vercel, Netlify, Cloudflare Pages) configurando *fallback* de rotas para `index.html` e as variáveis `EXPO_PUBLIC_*` no ambiente de build. Adicione o domínio em `ALLOWED_ORIGINS`/`ALLOWED_RETURN_URLS` das Edge Functions e nas URLs de redirecionamento do Supabase Auth.

## 5. Atualizações OTA

Correções só de JavaScript podem ir sem nova revisão de loja:

```bash
npx eas-cli@latest update --branch production --message "correção"
```
