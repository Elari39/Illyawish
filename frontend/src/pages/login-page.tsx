import {
  useEffect,
  useState,
} from 'react'
import { MessageSquareMore } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { LanguageSwitcher } from '../i18n/language-switcher'
import { useI18n } from '../i18n/use-i18n'
import { authApi, isNetworkError } from '../lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, refreshUser } = useAuth()
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingBootstrap, setIsCheckingBootstrap] = useState(true)
  const [bootstrapRequired, setBootstrapRequired] = useState(false)

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname

  useEffect(() => {
    let isMounted = true

    void (async () => {
      try {
        setIsCheckingBootstrap(true)
        const status = await authApi.bootstrapStatus()
        if (isMounted) {
          setBootstrapRequired(status.required)
        }
      } catch (nextError) {
        if (isMounted) {
          setError(
            isNetworkError(nextError)
              ? t('error.backendUnavailable')
              : nextError instanceof Error
                ? nextError.message
                : t('login.error'),
          )
        }
      } finally {
        if (isMounted) {
          setIsCheckingBootstrap(false)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [t])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      if (bootstrapRequired) {
        await authApi.bootstrap({ username, password })
        await refreshUser()
        setBootstrapRequired(false)
      } else {
        await login({ username, password })
      }

      if (redirectTo) {
        navigate(redirectTo, { replace: true })
        return
      }

      navigate('/chat', { replace: true })
    } catch (nextError) {
      setError(resolveErrorMessage(nextError, 'login.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function resolveErrorMessage(nextError: unknown, fallbackKey: 'login.error') {
    if (isNetworkError(nextError)) {
      return t('error.backendUnavailable')
    }

    return nextError instanceof Error
      ? nextError.message
      : t(fallbackKey)
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-6 py-10 text-[var(--foreground)]">
      <div className="mx-auto mb-6 flex max-w-6xl justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.9fr]">
          <section className="relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-8 shadow-[var(--shadow-md)] xl:p-12">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top,rgba(193,95,60,0.08),transparent_60%)] lg:block" />
            <div className="relative max-w-2xl space-y-8">
              <div className="inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--sidebar-bg)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                  <MessageSquareMore className="h-4 w-4" />
                </span>
                {t('login.workspaceBadge')}
              </div>
              <div className="space-y-5">
                <h1 className="max-w-xl font-['Lora',serif] text-4xl font-bold leading-tight tracking-tight text-[var(--foreground)] md:text-6xl">
                  {t('login.heroTitle')}
                </h1>
                <p className="max-w-xl text-base leading-8 text-[var(--muted-foreground)] md:text-lg">
                  {t('login.heroDescription')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FeatureCard
                  title={t('login.featureStreamingTitle')}
                  description={t('login.featureStreamingDescription')}
                />
                <FeatureCard
                  title={t('login.featurePersistentTitle')}
                  description={t('login.featurePersistentDescription')}
                />
                <FeatureCard
                  title={t('login.featureFocusedTitle')}
                  description={t('login.featureFocusedDescription')}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-8 shadow-[var(--shadow-md)] xl:p-10">
            <div className="mb-8 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                {bootstrapRequired ? t('login.bootstrapEyebrow') : t('login.signIn')}
              </p>
              <h2 className="text-3xl font-bold tracking-tight">
                {bootstrapRequired
                  ? t('login.bootstrapTitle')
                  : t('login.continueAs', { name: username || t('login.yourAccount') })}
              </h2>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                {bootstrapRequired
                  ? t('login.bootstrapDescription')
                  : t('login.prefilledDescription')}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('login.username')}
                </span>
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {t('login.password')}
                </span>
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {error ? (
                <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              ) : null}

              <Button
                className="w-full py-3"
                disabled={isSubmitting || isCheckingBootstrap}
                type="submit"
              >
                {isCheckingBootstrap
                  ? t('common.loading')
                  : isSubmitting
                    ? (bootstrapRequired ? t('login.creatingAccount') : t('login.signingIn'))
                    : (bootstrapRequired ? t('login.createFirstAdmin') : t('login.enterWorkspace'))}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}

function FeatureCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--sidebar-bg)] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
        {description}
      </p>
    </article>
  )
}
