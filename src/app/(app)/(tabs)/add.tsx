import { Redirect } from 'expo-router';

// A aba central abre a folha de ações rápidas; se a rota for acessada diretamente, volta ao início.
export default function AddPlaceholder() {
  return <Redirect href="/" />;
}
