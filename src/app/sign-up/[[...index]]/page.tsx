import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <h1 className="text-xl font-semibold">Sign up</h1>
        <p className="text-sm text-slate-300 mt-2">สร้างบัญชีภายในระบบ</p>

        <form className="mt-6 space-y-4" method="post" action="/api/auth/sign-up">
          <div className="space-y-1">
            <label className="text-sm text-slate-200" htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
            />
          </div>

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
            Create account
          </button>
        </form>

        <div className="mt-4 text-sm text-slate-300">
          มีบัญชีแล้ว? <Link className="underline" href="/sign-in">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
