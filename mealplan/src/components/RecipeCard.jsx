import { relativeDay } from '../lib/store'
import MatchLine from './MatchLine'

export default function RecipeCard({ recipe, pantrySet, pantryCount, onOpen }) {
  return (
    <button
      onClick={() => onOpen(recipe.id)}
      className="border border-ink bg-paper text-left p-4 cursor-pointer transition-all duration-150 ease-out hover:bg-ink/[0.03] active:scale-[0.99] flex flex-col gap-2.5"
    >
      <p className="micro text-ink/50">
        {[recipe.cuisine, `${recipe.prepTime} min`, recipe.mealType]
          .filter(Boolean)
          .join('  ·  ')
          .toUpperCase()}
      </p>
      <h3 className="text-[22px] font-extrabold leading-[1.05] tracking-[-0.03em]">
        {recipe.title}
      </h3>
      <div className="mt-auto space-y-1.5 pt-1">
        <MatchLine recipe={recipe} pantrySet={pantrySet} pantryCount={pantryCount} />
        <p className="micro text-ink/40">
          {recipe.forWho !== 'both' ? `${recipe.forWho} · ` : ''}
          last made: {relativeDay(recipe.lastMade)}
        </p>
      </div>
    </button>
  )
}
