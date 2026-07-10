import { useState } from 'react'
import { relativeDay } from '../lib/store'
import MatchLine from './MatchLine'

export default function TodaysPick({
  recipe,
  pantrySet,
  pantryCount,
  pantryOnly,
  onTogglePantryOnly,
  onReshuffle,
  onMadeIt,
  onOpen,
}) {
  // key bump forces the entry animation to replay on each reshuffle
  const [shuffleKey, setShuffleKey] = useState(0)
  const reshuffle = () => {
    onReshuffle()
    setShuffleKey((k) => k + 1)
  }

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase()

  return (
    <section className="px-4 sm:px-6 py-6">
      <div className="border border-ink">
        <div className="flex items-center justify-between bg-accent text-paper px-4 py-3">
          <span className="micro">Today's Pick</span>
          <span className="micro">{dateLabel}</span>
        </div>

        {recipe ? (
          <div key={shuffleKey} className="animate-pick p-5 sm:p-8">
            <p className="micro text-ink/50">
              {[recipe.cuisine, `prep · ${recipe.prepTime} min`, recipe.mealType, recipe.forWho !== 'both' ? recipe.forWho : null]
                .filter(Boolean)
                .join('  ·  ')
                .toUpperCase()}
            </p>
            <button
              onClick={() => onOpen(recipe.id)}
              className="block text-left cursor-pointer mt-3"
            >
              <h2 className="text-[36px] sm:text-[48px] font-extrabold leading-[1.02] tracking-[-0.04em]">
                {recipe.title}
              </h2>
            </button>
            <div className="mt-4 space-y-2">
              <MatchLine recipe={recipe} pantrySet={pantrySet} pantryCount={pantryCount} />
              <p className="micro text-ink/50">
                Last made: {relativeDay(recipe.lastMade).toUpperCase()}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:flex gap-2">
              <button className="btn btn-solid" onClick={() => onMadeIt(recipe.id)}>
                I made this
              </button>
              <button className="btn btn-ghost" onClick={reshuffle}>
                ↻ Reshuffle
              </button>
              <button
                className="btn btn-ghost col-span-2"
                onClick={() => onOpen(recipe.id)}
              >
                View recipe
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-8">
            <h2 className="text-[28px] font-extrabold tracking-[-0.03em] leading-tight">
              Nothing to pick.
            </h2>
            <p className="text-[14px] text-ink/60 mt-2 max-w-sm">
              {pantryOnly
                ? 'No recipe is fully cookable from your pantry. Stock the pantry tab or turn off the filter below.'
                : 'Add a recipe to get a daily suggestion.'}
            </p>
          </div>
        )}

        <label className="flex items-center justify-between gap-3 border-t border-ink px-4 py-3 cursor-pointer select-none">
          <span className="micro">Only suggest what we can make now</span>
          <button
            role="switch"
            aria-checked={pantryOnly}
            onClick={onTogglePantryOnly}
            className={`relative h-6 w-11 border border-ink transition-colors duration-150 cursor-pointer ${
              pantryOnly ? 'bg-ink' : 'bg-paper'
            }`}
          >
            <span
              className={`absolute top-[3px] h-4 w-4 transition-all duration-150 ease-out ${
                pantryOnly ? 'left-[24px] bg-paper' : 'left-[3px] bg-ink'
              }`}
            />
          </button>
        </label>
      </div>

      <p className="micro text-ink/40 mt-4 leading-relaxed normal-case tracking-normal text-[12px]">
        The picker favors recipes you haven't made or seen in a while, so
        forgotten favorites resurface.
      </p>
    </section>
  )
}
