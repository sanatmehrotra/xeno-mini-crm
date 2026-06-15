"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth";

const schema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router   = useRouter();
  const { token, setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  // Already logged in → go straight to dashboard
  useEffect(() => {
    if (token) router.replace("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }: FormValues) => {
    setError(null);
    try {
      const { data } = await authApi.login(email, password);
      setAuth(data.access_token, email);
      router.replace("/");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <main className="min-h-screen bg-espresso flex items-center justify-center px-4 relative overflow-hidden">
      {/* Atmospheric background — coffee-grain texture via radial gradients */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 80%, #3A2010 0%, transparent 70%), " +
            "radial-gradient(ellipse 40% 30% at 20% 20%, #2A1810 0%, transparent 60%)",
        }}
      />
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23E0964A' fill-opacity='1'%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Brand wordmark */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-parchment tracking-tight">
            BrewBharat
          </h1>
          <p className="mt-1 text-muted text-sm font-body tracking-wide uppercase">
            Marketing Console
          </p>
          <div className="mt-3 mx-auto w-12 h-px bg-copper/50" />
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="card space-y-4"
          noValidate
        >
          <div className="text-center mb-2">
            <p className="text-muted text-sm">Sign in to your workspace</p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="admin@brewbharat.in"
              className={`input ${errors.email ? "border-brick focus:border-brick focus:ring-brick/30" : ""}`}
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-brick text-xs">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={`input ${errors.password ? "border-brick focus:border-brick" : ""}`}
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-brick text-xs">{errors.password.message}</p>
            )}
          </div>

          {/* Server error */}
          {error && (
            <div className="bg-brick/10 border border-brick/30 rounded px-3 py-2 text-brick text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full mt-2 h-10"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-espresso/40 border-t-espresso rounded-full animate-spin" />
                Signing in…
              </span>
            ) : (
              "Sign in to Console"
            )}
          </button>
        </form>

        <p className="text-center text-muted/50 text-xs mt-6">
          Single-admin internal tool · BrewBharat CRM
        </p>
      </div>
    </main>
  );
}
