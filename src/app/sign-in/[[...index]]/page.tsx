import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-slate-300 mt-2">ใช้บัญชีภายในระบบ</p>

        <form className="mt-6 space-y-4" method="post" action="/api/auth/sign-in">
          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-100 text-slate-950 px-3 py-2 font-medium"
          >
            Sign in
          </button>
        </form>

        <div className="mt-4 text-sm text-slate-300">
          ยังไม่มีบัญชี? <Link className="underline" href="/sign-up">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
