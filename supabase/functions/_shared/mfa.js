export const mfaMessage = 'Confirme o código do aplicativo autenticador para entrar.';

export function verifiedTotp(user) {
 return user.factors?.find(factor => factor.factor_type === 'totp' && factor.status === 'verified');
}

export async function mfaSatisfied(auth, token, user) {
 if (!verifiedTotp(user)) return true;
 const { data, error } = await auth.getClaims(token);
 return !error && data?.claims?.aal === 'aal2';
}
