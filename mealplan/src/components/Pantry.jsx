import { useMemo, useState } from 'react'
import { normalize } from '../lib/store'

export default function Pantry({ pantry, recipes, onToggle, onClear }) {
  const [input, setInput] = useState('')

  const pantryNorm = useMemo(
    () => new Set(pantry.map(normalize)),
    [pantry],
  )

  // Every distinct ingredient across recipes not yet in the pantry —
  // one tap to mark it on hand.
  const suggestions = useMemo(() => {
    const seen = new Map()
    for (const r of recipes) {
      for (const ing of r.ingredients) {
        const n = normalize(ing.name)
        if (n && !pantryNorm.has(n) && !seen.has(n)) {
          seen.set(n, ing.name.trim())
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [recipes, pantryNorm])

  const add = (e) => {
    e.preventDefault()
    if (input.trim()) {
      onToggle(input)
      setInput('')
    }
  }

  return (
    <section className="px-4 sm:px-6 py-6">
      <form onSubmit={add} className="flex gap-2">
        <input
          className="field flex-1 text-[17px] py-3"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add ingredient on hand…"
        />
        <button type="submit" className="btn btn-solid shrink-0">
          Add
        </button>
      </form>

      <div className="border border-ink mt-5">
        <div className="flex items-center justify-between border-b border-ink px-3 py-2.5">
          <span className="micro">On hand ({pantry.length})</span>
          {pantry.length > 0 && (
            <button
              onClick={onClear}
              className="micro text-ink/45 hover:text-ink cursor-pointer transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {pantry.length ? (
          <div className="flex flex-wrap gap-2 p-3">
            {[...pantry]
              .sort((a, b) => a.localeCompare(b))
              .map((item) => (
                <button
                  key={item}
                  onClick={() => onToggle(item)}
                  title="Tap to remove"
                  className="border border-ink bg-ink text-paper px-3 py-2 text-[12px] font-semibold cursor-pointer transition-all duration-150 ease-out hover:bg-paper hover:text-ink active:scale-[0.96]"
                >
                  {item} ✕
                </button>
              ))}
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink/50">
            Nothing marked yet. Add what's in the kitchen — recipes will show
            what you can make right now.
          </p>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="border border-ink mt-4">
          <div className="border-b border-ink px-3 py-2.5">
            <span className="micro text-ink/50">
              From your recipes — tap to mark on hand
            </span>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {suggestions.map((item) => (
              <button
                key={item}
                onClick={() => onToggle(item)}
                className="border border-ink/40 px-3 py-2 text-[12px] cursor-pointer transition-all duration-150 ease-out hover:border-ink hover:bg-ink hover:text-paper active:scale-[0.96]"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
