"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/axios";
import {
  ArrowRight,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminAuthPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.email || !form.password) {
      toast({
        title: "Missing fields",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await adminApi.post("/auth/admin/login", form);

      if (response.data.success) {
        toast({
          title: "Welcome back!",
          description: "Login successful",
        });

        router.push("/admin");
      }
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.response?.data?.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-slate-50 p-4 dark:bg-slate-950 lg:grid-cols-2 lg:p-6">
      <section className="relative hidden overflow-hidden rounded-3xl bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.45),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.35),transparent_42%)]" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2.5">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold tracking-wide">
            Portfolio Chat
          </span>
        </div>
        <div className="relative max-w-md">
          <p className="text-sm font-medium text-violet-200">
            Support workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Give every conversation your full attention.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            A focused, secure inbox for the conversations that matter to your
            business.
          </p>
        </div>
        <p className="relative text-xs text-slate-400">
          Protected admin access · Session secured with HttpOnly cookies
        </p>
      </section>

      <section className="flex items-center justify-center lg:p-10">
        <Card className="w-full max-w-md border border-slate-200/80 bg-white shadow-xl shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="space-y-4 pb-6">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">Portfolio Chat</span>
            </div>
            <div className="rounded-xl bg-primary/10 p-3 text-primary w-fit">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Welcome back
              </CardTitle>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Sign in to manage your support inbox.
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="space-y-5"
              aria-busy={isLoading}
            >
              <div className="space-y-2">
                <label
                  htmlFor="admin-email"
                  className="text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="h-12 border-slate-200 pl-10 transition-colors focus-visible:ring-primary dark:border-slate-700"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="admin-password"
                  className="text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="h-12 border-slate-200 pl-10 transition-colors focus-visible:ring-primary dark:border-slate-700"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-12 w-full cursor-pointer font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <span>Sign in to inbox</span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              Restricted to authorised administrators.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
