"use client";

import { useState } from "react";
import { AlertCircle, Check, Circle, Eye, EyeOff, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { cn } from "@/lib/utils";

type Welcome = { name: string; username: string; role: string };

async function post(body: object) {
  const res = await fetch("/api/auth", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean };
  if (!res.ok) throw new Error(data.error || "Couldn't sign in");
  return data;
}

/** Sign in, or (signed in with a temporary password) choose your own. */
export function LoginForm({ company, logoUrl, welcome }: { company: string; logoUrl: string | null; welcome: Welcome | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-surface px-4 sm:justify-center sm:bg-gray-50 sm:px-6">
      <div className="w-full max-w-[400px] py-10 sm:rounded-xl sm:border sm:border-gray-150 sm:bg-surface sm:p-8">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={company} className="h-6 w-auto max-w-40 object-contain" />
          ) : (
            <>
              <Flame className="size-5 shrink-0 text-gray-900" />
              <span className="text-base font-semibold text-gray-900">{company}</span>
            </>
          )}
        </div>
        {welcome ? <ChoosePassword welcome={welcome} /> : <SignIn />}
      </div>
      <p className="mt-auto pb-6 text-xs text-gray-400 sm:absolute sm:bottom-0">{company}</p>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className="h-11 pr-11 text-base sm:h-control-lg sm:pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 sm:right-1"
        onClick={() => setShown((v) => !v)}
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post({ action: "login", username, password, remember });
      // The server decides: the app, or the choose-a-password step.
      window.location.assign("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't sign in";
      setError(
        message === "Wrong username or password"
          ? "Wrong username or password. Check them, or ask your main user to reset your password."
          : message,
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-600">Inventory and warehouse system</p>
      </div>
      <form className="mt-5 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username" className="text-gray-600">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            className="h-11 text-base sm:h-control-lg"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-gray-600">Password</Label>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} invalid={Boolean(error)} />
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-text">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <label className="flex w-fit items-center gap-2 text-sm text-gray-900">
          <Checkbox checked={remember} onCheckedChange={(value) => setRemember(Boolean(value))} className="size-4" />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" className="mt-1 h-11 w-full sm:h-control-md" disabled={submitting || !username || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-gray-600">Forgot your password? Ask your main user to reset it.</p>
    </>
  );
}

function Rule({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-xs", met ? "text-success-text" : "text-gray-500")}>
      {met ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
      {children}
    </li>
  );
}

function ChoosePassword({ welcome }: { welcome: Welcome }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const long = password.length >= PASSWORD_MIN;
  const same = Boolean(confirm) && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post({ action: "password", password });
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the password");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Welcome, {welcome.name.split(" ")[0]}</h1>
        <p className="text-sm text-gray-600">Choose your own password to finish setting up your account.</p>
      </div>
      <form className="mt-5 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password" className="text-gray-600">New password</Label>
          <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={setPassword} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password" className="text-gray-600">Confirm password</Label>
          <PasswordInput id="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </div>
        <ul className="flex flex-col gap-1" aria-live="polite">
          <Rule met={long}>At least {PASSWORD_MIN} characters</Rule>
          <Rule met={same}>Both passwords match</Rule>
        </ul>
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-text">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" className="mt-1 h-11 w-full sm:h-control-md" disabled={submitting || !long || !same}>
          {submitting ? "Saving…" : "Save password and sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-gray-600">
        Signed in as {welcome.username} · {welcome.role} ·{" "}
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => void post({ action: "logout" }).finally(() => window.location.reload())}
        >
          Not you?
        </button>
      </p>
    </>
  );
}
