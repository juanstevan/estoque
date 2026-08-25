"use client";

import { useState } from "react";
import { AlertCircle, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", username, password }),
    });
    setSubmitting(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't sign in with those details");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-90 rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-gray-900" />
          <span className="text-md font-semibold text-gray-900">Chaleur</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Inventory and warehouse system
        </p>

        <form className="mt-6 grid gap-5" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-1">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-danger-text">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
