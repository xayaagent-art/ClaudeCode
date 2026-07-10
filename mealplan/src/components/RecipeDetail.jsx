import { useState } from 'react'
import { relativeDay, normalize } from '../lib/store'

export default function RecipeDetail({
  recipe,
  pantrySet,
  pantryCount,
  onClose,
  onEdit,
  onDelete,
  onMadeIt,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [justMade, setJustMade] = useState(false)

  const madeIt = () => {
    onMadeIt()
    setJustMade(true)
  }

  return (
    <div className="fixed inset-0 z-30 bg-paper overflow-y-auto animate-overlay">
      <div className="max-w-3xl mx-auto min-h-full border-x border-ink/15 flex flex-col">
        <div className="flex items-center justify-between border-b border-ink px-4 sm:px-6 py-3 sticky top-0 bg-paper z-10">
          <span className="micro text-ink/50">Recipe</span>
          <button
            onClick={onClose}
            className="btn btn-ghost !px-3 !py-2"
            aria-label="Close"
          >
            ✕ Close
          </button>
        </div>

        <div className="px-4 sm:px-6 py-6 flex-1">
          <p className="micro text-ink/50">
            {[recipe.cuisine, `prep · ${recipe.prepTime} min`, recipe.mealType, recipe.forWho]
              .filter(Boolean)
              .join('  ·  ')
              .toUpperCase()}
          </p>
          <h2 className="text-[36px] sm:text-[44px] font-extrabold leading-[1.02] tracking-[-0.04em] mt-3">
            {recipe.title}
          </h2>
          <p className="micro text-ink/50 mt-3">
            Last made: {relativeDay(recipe.lastMade).toUpperCase()}
          </p>

          <div className="mt-8 grid sm:grid-cols-[1fr_1.6fr] gap-6">
            <section className="border border-ink">
              <h3 className="micro border-b border-ink px-3 py-2.5">
                Ingredients ({recipe.ingredients.length})
              </h3>
              <ul>
                {recipe.ingredients.map((ing, i) => {
                  const onHand =
                    pantryCount > 0 && pantrySet.has(normalize(ing.name))
                  return (
                    <li
                      key={i}
                      className={`flex items-baseline gap-2 px-3 py-2 text-[14px] ${
                        i > 0 ? 'border-t border-ink/15' : ''
                      }`}
                    >
                      <span className="micro text-ink/45 w-16 shrink-0">
                        {ing.qty}
                      </span>
                      <span className={pantryCount > 0 && !onHand ? 'text-ink/45' : ''}>
                        {ing.name}
                      </span>
                      {pantryCount > 0 && (
                        <span className="micro ml-auto shrink-0">
                          {onHand ? '✓' : '—'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            <section>
              <h3 className="micro border-b border-ink pb-2.5">Method</h3>
              <ol className="mt-1">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-4 py-3 border-b border-ink/15">
                    <span className="text-[22px] font-extrabold tracking-[-0.03em] leading-none text-ink/25 w-8 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-[15px] leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        <div className="border-t border-ink px-4 sm:px-6 py-4 flex flex-wrap gap-2 sticky bottom-0 bg-paper">
          <button className="btn btn-solid" onClick={madeIt}>
            {justMade ? '✓ Logged today' : 'I made this'}
          </button>
          <button className="btn btn-ghost" onClick={onEdit}>
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                className="btn border-accent text-accent hover:bg-accent hover:text-paper"
                onClick={onDelete}
              >
                Confirm delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost ml-auto"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
