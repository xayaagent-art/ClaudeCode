import { useEffect, useMemo, useState } from 'react'
import { usePersistentState, todayStr, normalize } from './lib/store'
import { pantrySetOf, matchRecipe } from './lib/match'
import { weightedPick } from './lib/picker'
import TodaysPick from './components/TodaysPick'
import RecipeList from './components/RecipeList'
import RecipeForm from './components/RecipeForm'
import RecipeDetail from './components/RecipeDetail'
import Pantry from './components/Pantry'

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'pantry', label: 'Pantry' },
]

export default function App() {
  const [state, setState] = usePersistentState()
  const [tab, setTab] = useState('today')
  const [detailId, setDetailId] = useState(null)
  const [editing, setEditing] = useState(null) // 'new' | recipe id | null

  const pantrySet = useMemo(() => pantrySetOf(state.pantry), [state.pantry])

  // Recipes eligible for Today's Pick (optionally only fully-cookable ones)
  const pickPool = useMemo(() => {
    if (!state.pickPantryOnly) return state.recipes
    return state.recipes.filter(
      (r) => matchRecipe(r, pantrySet).missing.length === 0,
    )
  }, [state.recipes, state.pickPantryOnly, pantrySet])

  const applyPick = (recipe) =>
    setState((s) => ({
      ...s,
      pick: { date: todayStr(), id: recipe.id },
      recipes: s.recipes.map((r) =>
        r.id === recipe.id
          ? { ...r, lastPicked: Date.now(), timesPicked: (r.timesPicked || 0) + 1 }
          : r,
      ),
    }))

  // Keep a stable pick for the day; re-pick when it's stale, deleted,
  // or no longer allowed by the pantry-only toggle.
  useEffect(() => {
    const p = state.pick
    const valid =
      p && p.date === todayStr() && pickPool.some((r) => r.id === p.id)
    if (valid) return
    if (!pickPool.length) {
      if (p) setState((s) => ({ ...s, pick: null }))
      return
    }
    applyPick(weightedPick(pickPool))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pick, pickPool])

  const reshuffle = () => {
    const next = weightedPick(pickPool, state.pick?.id)
    if (next) applyPick(next)
  }

  const saveRecipe = (recipe) => {
    setState((s) => {
      const exists = s.recipes.some((r) => r.id === recipe.id)
      return {
        ...s,
        recipes: exists
          ? s.recipes.map((r) => (r.id === recipe.id ? recipe : r))
          : [...s.recipes, recipe],
      }
    })
    setEditing(null)
  }

  const deleteRecipe = (id) => {
    setState((s) => ({
      ...s,
      recipes: s.recipes.filter((r) => r.id !== id),
      pick: s.pick?.id === id ? null : s.pick,
    }))
    setDetailId(null)
  }

  const madeIt = (id) =>
    setState((s) => ({
      ...s,
      recipes: s.recipes.map((r) =>
        r.id === id ? { ...r, lastMade: Date.now() } : r,
      ),
    }))

  const togglePantryItem = (name) => {
    const n = normalize(name)
    if (!n) return
    setState((s) => {
      const has = s.pantry.some((p) => normalize(p) === n)
      return {
        ...s,
        pantry: has
          ? s.pantry.filter((p) => normalize(p) !== n)
          : [...s.pantry, name.trim()],
      }
    })
  }

  const pickRecipe = state.pick
    ? state.recipes.find((r) => r.id === state.pick.id)
    : null
  const detailRecipe = detailId
    ? state.recipes.find((r) => r.id === detailId)
    : null
  const editingRecipe =
    editing && editing !== 'new'
      ? state.recipes.find((r) => r.id === editing)
      : null

  return (
    <div className="min-h-screen max-w-5xl mx-auto border-x border-ink/15">
      <header className="border-b border-ink sticky top-0 z-20 bg-paper">
        <div className="flex items-end justify-between px-4 sm:px-6 pt-5 pb-4">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-extrabold leading-none tracking-[-0.04em]">
              MEALPLAN
            </h1>
            <p className="micro text-ink/50 mt-2">What's for dinner, solved</p>
          </div>
          <button className="btn btn-solid" onClick={() => setEditing('new')}>
            + Recipe
          </button>
        </div>
        <nav className="grid grid-cols-3 border-t border-ink">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`micro py-3.5 cursor-pointer transition-colors duration-150 ${
                i > 0 ? 'border-l border-ink' : ''
              } ${
                tab === t.id
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink hover:bg-ink/5'
              }`}
            >
              {t.label}
              {t.id === 'recipes' && ` (${state.recipes.length})`}
              {t.id === 'pantry' && ` (${state.pantry.length})`}
            </button>
          ))}
        </nav>
      </header>

      <main className="pb-20">
        {tab === 'today' && (
          <TodaysPick
            recipe={pickRecipe}
            pantrySet={pantrySet}
            pantryCount={state.pantry.length}
            pantryOnly={state.pickPantryOnly}
            onTogglePantryOnly={() =>
              setState((s) => ({ ...s, pickPantryOnly: !s.pickPantryOnly }))
            }
            onReshuffle={reshuffle}
            onMadeIt={madeIt}
            onOpen={setDetailId}
          />
        )}
        {tab === 'recipes' && (
          <RecipeList
            recipes={state.recipes}
            pantrySet={pantrySet}
            pantryCount={state.pantry.length}
            onOpen={setDetailId}
            onAdd={() => setEditing('new')}
          />
        )}
        {tab === 'pantry' && (
          <Pantry
            pantry={state.pantry}
            recipes={state.recipes}
            onToggle={togglePantryItem}
            onClear={() => setState((s) => ({ ...s, pantry: [] }))}
          />
        )}
      </main>

      {detailRecipe && (
        <RecipeDetail
          recipe={detailRecipe}
          pantrySet={pantrySet}
          pantryCount={state.pantry.length}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detailRecipe.id)}
          onDelete={() => deleteRecipe(detailRecipe.id)}
          onMadeIt={() => madeIt(detailRecipe.id)}
        />
      )}
      {editing && (
        <RecipeForm
          recipe={editingRecipe}
          existingCuisines={[
            ...new Set(state.recipes.map((r) => r.cuisine).filter(Boolean)),
          ]}
          onSave={saveRecipe}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
