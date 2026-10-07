/** Password rules, shared by the sign-in page and the server. */
export const PASSWORD_MIN = 8;

export function passwordProblem(password: string) {
  return password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters` : null;
}
