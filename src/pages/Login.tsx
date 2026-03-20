import { useState } from 'react'
import { useStore } from '../store/store'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const signIn = useStore((s) => s.signIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn(email)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-rh-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold mb-2">
            <span className="text-rh-green">θ</span>Wheel
          </div>
          <p className="text-rh-subtext text-sm">
            Your Wheel Strategy Command Center
          </p>
        </div>

        {sent ? (
          <div className="card text-center">
            <div className="text-rh-green text-3xl mb-3">✓</div>
            <h2 className="text-lg font-semibold mb-2">Check your email</h2>
            <p className="text-sm text-rh-subtext">
              We sent a magic link to <strong className="text-rh-text">{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full"
                autoComplete="email"
              />
            </div>

            {error && (
              <p className="text-rh-red text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Sign in with Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
