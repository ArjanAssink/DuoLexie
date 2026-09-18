import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { AvatarView } from '../components/AvatarView'
import { AvatarPickers } from '../components/AvatarPickers'
import { FridaSays } from '../components/FridaSays'
import { WipNote } from '../components/WipNote'
import { FlitsIcon, GemIcon, FlameIcon } from '../components/Icons'
import { useAvatar } from '../state/avatar'
import { MAX_PLAYER_NAME, normalizePlayerName, useProgress } from '../state/progress'
import { prefersReducedMotion } from '../motion'

/** The three steps she walks through, plus the closing beat that is not a step. */
type Step = 'welkom' | 'naam' | 'avatar' | 'klaar'

const STEPS: Step[] = ['welkom', 'naam', 'avatar']

/** The closing beat, long enough to read "Veel plezier!" and watch the confetti fall. */
const KLAAR_MS = 900
/** Without animation there is nothing to wait for — just long enough not to feel like a jump cut. */
const KLAAR_REDUCED_MS = 400

/**
 * The first visit: who Frida is, what her name is, what her avatar looks like.
 *
 * Step state is local `useState` rather than a route per step — the flow is one screen that
 * changes, and three history entries would turn the phone's back gesture into a way to land
 * halfway through it (docs/onboarding-welkom.md ss7).
 *
 * Nothing here is written to the store until she asks for it: the name on "Verder", the
 * avatar as she taps (that store is the same one Profiel writes to), and the onboarding flag
 * only on the closing beat. Leaving halfway therefore leaves her exactly where she was.
 */
export function OnboardingScreen() {
  const storedName = useProgress((s) => s.settings.playerName)
  const setPlayerName = useProgress((s) => s.setPlayerName)
  const completeOnboarding = useProgress((s) => s.completeOnboarding)
  const avatarConfig = useAvatar((s) => s.config)

  const [step, setStep] = useState<Step>('welkom')
  // Set when the closing beat has played out; the redirect is rendered, not called.
  const [finished, setFinished] = useState(false)
  // Seeded from the store so re-opening the intro from Profiel shows the name she already
  // has instead of an empty field she would have to retype.
  const [draftName, setDraftName] = useState(storedName)

  // What the bubble and the greeting use — normalized, so a trailing space she has not
  // finished typing over never reaches "Hoi, {naam}!".
  const name = normalizePlayerName(draftName)

  // The desktop backdrop (a soft gradient and a very faint Frida behind the card) is painted
  // on <body>, which is outside this tree — hence an attribute on <html> rather than a class
  // here. Removed on unmount so it cannot leak into the leerpad.
  useEffect(() => {
    document.documentElement.setAttribute('data-welkom', '')
    return () => document.documentElement.removeAttribute('data-welkom')
  }, [])

  /*
   * The closing beat. completeOnboarding() fires as soon as this step is reached rather than
   * after the delay: if she closes the tab during the confetti she is still onboarded, which
   * is the answer that does not make her sit through the whole flow again.
   *
   * The timer only flips a piece of local state; the redirect itself is the <Navigate> below.
   * Calling navigate() from inside the timeout left the ipad/iphone WebKit runs stuck on this
   * screen with the URL already changed to #/ — the declarative form is the one every other
   * redirect in the app uses and the one the gate's own tests already prove works there.
   * Keeping useNavigate's return value out of the dependency list is the other half of that:
   * its identity tracks the current location, so an effect that depends on it can be torn
   * down and restarted by the very navigation it is waiting to perform.
   */
  useEffect(() => {
    if (step !== 'klaar') return
    completeOnboarding()
    const reduced = prefersReducedMotion()
    if (!reduced) confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } })
    const timer = setTimeout(() => setFinished(true), reduced ? KLAAR_REDUCED_MS : KLAAR_MS)
    return () => clearTimeout(timer)
  }, [step, completeOnboarding])

  function goToAvatar(withName: string) {
    setPlayerName(withName)
    setStep('avatar')
  }

  if (step === 'klaar') {
    // `replace`, so the phone's back gesture after finishing leaves the app rather than
    // dropping her back into the intro she has just been through.
    if (finished) return <Navigate to="/" replace />
    return (
      <div className="welkom welkom-klaar">
        <FridaSays expression="head-celebrating" size={120} bubble="large">
          {name ? `Veel plezier, ${name}!` : 'Veel plezier!'}
        </FridaSays>
      </div>
    )
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="welkom">
      <header className="welkom-top">
        {stepIndex > 0 && (
          <button
            className="welkom-back"
            aria-label="Terug"
            onClick={() => setStep(STEPS[stepIndex - 1])}
          >
            ‹
          </button>
        )}
        <div className="welkom-dots" role="presentation">
          {STEPS.map((s, i) => (
            <span key={s} className={`welkom-dot ${i <= stepIndex ? 'on' : ''}`} />
          ))}
        </div>
      </header>

      {step === 'welkom' && (
        <>
          <div className="welkom-body">
            {/* TODO: a waving Frida would beat happy+float here — art task, see docs/onboarding-welkom.md ss5. */}
            <FridaSays expression="happy" size={138} bubble="large" className="frida-says-hero">
              Hoi! Ik ben Frida.
            </FridaSays>
            <span className="welkom-kicker">DUOLEXIE</span>
            <h1>Lezen oefenen, maar dan leuk.</h1>
            <p className="welkom-intro">
              DuoLexie is een oefen-app voor kinderen met dyslexie die bij RID leren lezen.
              Korte spelletjes met klanken en woorden, een paar minuten per dag — náást je
              gewone oefeningen, niet in plaats daarvan.
            </p>
            <ul className="welkom-bullets">
              <li>
                {/* the lightning LessonIcon dispatches to; LessonIcon itself is keyed on a lesson title */}
                <FlitsIcon fill="var(--teal)" size={22} />
                Snelle spelletjes met klanken en woorden
              </li>
              <li>
                <GemIcon size={22} />
                Edelstenen verdienen en je eigen avatar aankleden
              </li>
              <li>
                <FlameIcon size={22} />
                Een weekdoel: 5 van de 7 dagen oefenen
              </li>
            </ul>
          </div>
          <div className="welkom-actions">
            <button className="btn-primary welkom-cta" onClick={() => setStep('naam')}>
              Aan de slag
            </button>
            <WipNote className="welkom-footer" />
          </div>
        </>
      )}

      {step === 'naam' && (
        <>
          <div className="welkom-body">
            <FridaSays expression="head-grumpy" size={72}>
              {name ? `Hoi, ${name}!` : 'Hoe heet jij?'}
            </FridaSays>
            <h1>Hoe mogen we je noemen?</h1>
            <form
              className="welkom-name-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (name) goToAvatar(name)
              }}
            >
              <input
                className="welkom-name-input"
                type="text"
                value={draftName}
                placeholder="Je naam"
                aria-label="Je naam"
                autoComplete="given-name"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                inputMode="text"
                maxLength={MAX_PLAYER_NAME}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <span className="welkom-helper">Alleen je voornaam is genoeg.</span>
            </form>
          </div>
          <div className="welkom-actions">
            <button
              className="btn-primary welkom-cta"
              disabled={!name}
              onClick={() => goToAvatar(name)}
            >
              Verder
            </button>
            <button className="welkom-skip" onClick={() => goToAvatar('')}>
              Liever geen naam
            </button>
          </div>
        </>
      )}

      {step === 'avatar' && (
        <>
          <div className="welkom-body">
            <FridaSays expression="head-grumpy" size={56} className="frida-says-corner">
              {name ? `Mooi, ${name}!` : 'Mooi zo!'}
            </FridaSays>
            <h1>Maak je eigen avatar</h1>
            <p className="welkom-sub">Dit kun je later altijd veranderen bij Profiel.</p>
            <div className="avatar-stage">
              <AvatarView config={avatarConfig} crop="full" className="avatar-big" />
            </div>
            <AvatarPickers />
          </div>
          <div className="welkom-actions">
            <button className="btn-primary welkom-cta" onClick={() => setStep('klaar')}>
              Klaar!
            </button>
          </div>
        </>
      )}
    </div>
  )
}
