export const DEMO_USER = {
  id: "demo",
  name: "Usuário Demo",
  email: "demo@estoque.local",
} as const;

export function currentUserId() {
  return DEMO_USER.id;
}

export function currentUserName() {
  return DEMO_USER.name;
}
