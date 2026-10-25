'use client'

import { useState, type FormEvent } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { useApiAction } from './use-api-action'

const MAX_SKILLS = 5

export function SkillsForm({
  categories,
  initial,
}: {
  categories: { id: string; name: string; iconKey: string }[]
  initial: string[]
}) {
  const { pending, error, run } = useApiAction()
  const [selected, setSelected] = useState<string[]>(initial)
  const full = selected.length >= MAX_SKILLS

  const save = (event: FormEvent) => {
    event.preventDefault()
    return run(
      () => apiFetch('/api/v1/worker/skills', { method: 'PUT', body: { categoryIds: selected } }),
      { success: 'Skills saved' },
    )
  }

  const removed = initial.filter((id) => !selected.includes(id)).length

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-3 text-sm text-ink-600">
          Choose up to {MAX_SKILLS}. You will set a price for each service in these.
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => {
            const checked = selected.includes(c.id)
            return (
              <label
                key={c.id}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                  checked ? 'border-brand-600 bg-brand-50' : 'border-border',
                  !checked && full && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id),
                    )
                  }
                />
                <CategoryIcon iconKey={c.iconKey} className="size-9" />
                <span className="text-sm font-medium">{c.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {removed > 0 && (
        <p className="rounded-md bg-warning-700/10 px-3 py-2 text-sm text-ink-900" role="status">
          Prices for services in removed skills will be switched off.
        </p>
      )}
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingText="Saving…"
        disabled={selected.length === 0}
        className="self-start"
      >
        Save skills
      </Button>
    </form>
  )
}
