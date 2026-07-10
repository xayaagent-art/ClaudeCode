import { useState } from 'react'
import { uid } from '../lib/store'

const emptyIngredient = () => ({ qty: '', name: '' })

export default function RecipeForm({ recipe, existingCuisines, onSave, onCancel }) {
  const [title, setTitle] = useState(recipe?.title || '')
  const [cuisine, setCuisine] = useState(recipe?.cuisine || '')
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? '')
  const [mealType, setMealType] = useState(recipe?.mealType || 'dinner')
  const [forWho, setForWho] = useState(recipe?.forWho || 'both')
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((i) => ({ ...i }))
      : [emptyIngredient(), emptyIngredient(), emptyIngredient()],
  )
  const [stepsText, setStepsText] = useState(recipe?.steps?.join('\n') || '')
  const [error, setError] = useState('')

  const setIngredient = (i, patch) =>
    setIngredients((list) =>
      list.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)),
    )

  const submit = (e) => {
    e.preventDefault()
    const cleanIngredients = ingredients
      .map((i) => ({ qty: i.qty.trim(), name: i.name.trim() }))
      .filter((i) => i.name)
    const steps = stepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!title.trim()) return setError('A title is required.')
    if (!cleanIngredients.length)
      return setError('Add at least one ingredient.')
    onSave({
      id: recipe?.id || uid(),
      title: title.trim(),
      cuisine: cuisine.trim(),
      prepTime: Math.max(0, parseInt(prepTime, 10) || 0),
      mealType,
      forWho,
      ingredients: cleanIngredients,
      steps,
      lastMade: recipe?.lastMade ?? null,
      lastPicked: recipe?.lastPicked ?? null,
      timesPicked: recipe?.timesPicked ?? 0,
    })
  }

  return (
    <div className="fixed inset-0 z-40 bg-paper overflow-y-auto animate-overlay">
      <form
        onSubmit={submit}
        className="max-w-3xl mx-auto min-h-full border-x border-ink/15 flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-ink px-4 sm:px-6 py-3 sticky top-0 bg-paper z-10">
          <span className="micro text-ink/50">
            {recipe ? 'Edit recipe' : 'New recipe'}
          </span>
          <button type="button" onClick={onCancel} className="btn btn-ghost !px-3 !py-2">
            ✕ Cancel
          </button>
        </div>

        <div className="px-4 sm:px-6 py-6 space-y-6 flex-1">
          <div>
            <label className="micro text-ink/50 block mb-2">Title</label>
            <input
              className="field text-[22px] font-bold tracking-[-0.02em] py-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Garlic Butter Pasta"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="micro text-ink/50 block mb-2">Cuisine</label>
              <input
                className="field"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                placeholder="Italian"
                list="cuisines"
              />
              <datalist id="cuisines">
                {existingCuisines.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="micro text-ink/50 block mb-2">Prep (min)</label>
              <input
                className="field"
                type="number"
                min="0"
                inputMode="numeric"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="25"
              />
            </div>
            <div>
              <label className="micro text-ink/50 block mb-2">Meal</label>
              <select
                className="field cursor-pointer"
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
              >
                <option value="breakfast">breakfast</option>
                <option value="lunch">lunch</option>
                <option value="dinner">dinner</option>
                <option value="snack">snack</option>
              </select>
            </div>
            <div>
              <label className="micro text-ink/50 block mb-2">For</label>
              <select
                className="field cursor-pointer"
                value={forWho}
                onChange={(e) => setForWho(e.target.value)}
              >
                <option value="both">both</option>
                <option value="mine">mine</option>
                <option value="partner's">partner's</option>
              </select>
            </div>
          </div>

          <div>
            <label className="micro text-ink/50 block mb-2">Ingredients</label>
            <div className="border border-ink divide-y divide-ink/15">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex">
                  <input
                    className="w-24 sm:w-32 shrink-0 bg-transparent px-3 py-2.5 text-[14px] outline-none border-r border-ink/15 placeholder:text-ink/30"
                    value={ing.qty}
                    onChange={(e) => setIngredient(i, { qty: e.target.value })}
                    placeholder="2 tbsp"
                  />
                  <input
                    className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-[14px] outline-none placeholder:text-ink/30"
                    value={ing.name}
                    onChange={(e) => setIngredient(i, { name: e.target.value })}
                    placeholder="ingredient"
                  />
                  <button
                    type="button"
                    aria-label="Remove ingredient"
                    onClick={() =>
                      setIngredients((list) =>
                        list.length > 1 ? list.filter((_, idx) => idx !== i) : list,
                      )
                    }
                    className="px-3 text-ink/40 hover:text-ink cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost mt-2 !py-2"
              onClick={() => setIngredients((list) => [...list, emptyIngredient()])}
            >
              + Ingredient
            </button>
          </div>

          <div>
            <label className="micro text-ink/50 block mb-2">
              Method — one step per line
            </label>
            <textarea
              className="field min-h-40 leading-relaxed"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={'Boil the pasta.\nMake the sauce.\nToss together.'}
            />
          </div>

          {error && (
            <p className="micro text-accent border border-accent px-3 py-2.5">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-ink px-4 sm:px-6 py-4 flex gap-2 sticky bottom-0 bg-paper">
          <button type="submit" className="btn btn-solid flex-1 sm:flex-none sm:px-10">
            Save recipe
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
