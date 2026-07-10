import { useMemo, useState } from 'react'
import { matchRecipe } from '../lib/match'
import RecipeCard from './RecipeCard'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
const PANTRY_MODES = [
  { id: 'all', label: 'All' },
  { id: 'cookable', label: 'Cookable' },
  { id: 'almost', label: '≤ 2 missing' },
]

export default function RecipeList({ recipes, pantrySet, pantryCount, onOpen, onAdd }) {
  const [query, setQuery] = useState('')
  const [mealType, setMealType] = useState(null)
  const [cuisine, setCuisine] = useState('')
  const [who, setWho] = useState('')
  const [pantryMode, setPantryMode] = useState('all')

  const cuisines = useMemo(
    () => [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))].sort(),
    [recipes],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = recipes.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false
      if (mealType && r.mealType !== mealType) return false
      if (cuisine && r.cuisine !== cuisine) return false
      if (who && r.forWho !== who) return false
      if (pantryMode !== 'all') {
        const missing = matchRecipe(r, pantrySet).missing.length
        if (pantryMode === 'cookable' && missing > 0) return false
        if (pantryMode === 'almost' && missing > 2) return false
      }
      return true
    })
    if (pantryMode !== 'all') {
      list = [...list].sort(
        (a, b) =>
          matchRecipe(a, pantrySet).missing.length -
          matchRecipe(b, pantrySet).missing.length,
      )
    } else {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    }
    return list
  }, [recipes, query, mealType, cuisine, who, pantryMode, pantrySet])

  return (
    <section className="px-4 sm:px-6 py-6">
      <input
        type="search"
        className="field text-[17px] py-3"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt}
            onClick={() => setMealType(mealType === mt ? null : mt)}
            className={`micro border border-ink px-3 py-2 cursor-pointer transition-colors duration-150 ${
              mealType === mt ? 'bg-ink text-paper' : 'hover:bg-ink/5'
            }`}
          >
            {mt}
          </button>
        ))}
        <select
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          className="micro border border-ink bg-paper px-2 py-2 cursor-pointer rounded-none outline-none"
        >
          <option value="">Cuisine: all</option>
          {cuisines.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="micro border border-ink bg-paper px-2 py-2 cursor-pointer rounded-none outline-none"
        >
          <option value="">For: anyone</option>
          <option value="both">both</option>
          <option value="mine">mine</option>
          <option value="partner's">partner's</option>
        </select>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="micro text-ink/50">Pantry</span>
        <div className="flex border border-ink">
          {PANTRY_MODES.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setPantryMode(m.id)}
              className={`micro px-3 py-2 cursor-pointer transition-colors duration-150 ${
                i > 0 ? 'border-l border-ink' : ''
              } ${pantryMode === m.id ? 'bg-ink text-paper' : 'hover:bg-ink/5'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {pantryMode !== 'all' && pantryCount === 0 && (
        <p className="micro text-ink/50 mt-2">
          Pantry is empty — mark ingredients on hand in the Pantry tab first.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            pantrySet={pantrySet}
            pantryCount={pantryCount}
            onOpen={onOpen}
          />
        ))}
      </div>

      {!visible.length && (
        <div className="border border-ink mt-5 p-8 text-center">
          <p className="text-[18px] font-bold tracking-[-0.02em]">
            No recipes match.
          </p>
          <p className="text-[13px] text-ink/55 mt-1">
            Loosen the filters, or add something new.
          </p>
          <button className="btn btn-solid mt-4" onClick={onAdd}>
            + Add recipe
          </button>
        </div>
      )}
    </section>
  )
}
