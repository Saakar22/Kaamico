'use client'

import { Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { MoneyInput } from '@/components/ui/money-input'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { apiFetch } from '@/lib/api-client'

export type CatalogService = {
  id: string
  categoryId: string
  slug: string
  name: string
  description: string | null
  pricingUnit: string
  typicalDurationMin: number
  referenceMinPaise: number | null
  referenceMaxPaise: number | null
  searchTerms: string
  isActive: boolean
}

export type CatalogCategory = {
  id: string
  slug: string
  name: string
  description: string | null
  iconKey: string
  sortOrder: number
  isActive: boolean
  services: CatalogService[]
}

const UNITS = [
  ['PER_VISIT', 'Per visit'],
  ['PER_HOUR', 'Per hour'],
  ['PER_ITEM', 'Per item'],
  ['PER_SQFT', 'Per sq ft'],
  ['FIXED', 'Fixed price'],
] as const

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

/** A dialog form that saves through the admin API and refreshes the page. */
function EditDialog({
  trigger,
  title,
  onSave,
  children,
  error,
  pending,
  open,
  setOpen,
}: {
  trigger: ReactNode
  title: string
  onSave: () => void
  children: ReactNode
  error?: string
  pending: boolean
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
          {error && (
            <p className="text-sm text-danger-700" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} loadingText="Saving…">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CategoryDialog({
  category,
  iconKeys,
}: {
  category?: CatalogCategory
  iconKeys: string[]
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [iconKey, setIconKey] = useState(category?.iconKey ?? iconKeys[0])
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0))

  const save = () =>
    run(
      async () => {
        const body = { name, slug, description, iconKey, sortOrder: Number(sortOrder) || 0 }
        await (category
          ? apiFetch(`/api/v1/admin/categories/${category.id}`, { method: 'PATCH', body })
          : apiFetch('/api/v1/admin/categories', { body }))
        setOpen(false)
      },
      { success: category ? 'Category saved' : 'Category added' },
    )

  return (
    <EditDialog
      open={open}
      setOpen={setOpen}
      pending={pending}
      error={Object.keys(fieldErrors).length ? undefined : error}
      onSave={save}
      title={category ? `Edit ${category.name}` : 'Add a category'}
      trigger={
        category ? (
          <Button variant="tertiary" size="sm" aria-label={`Edit ${category.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Add category
          </Button>
        )
      }
    >
      <FormField label="Name" required error={fieldErrors.name}>
        {(field) => (
          <Input
            {...field}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value)
              if (!category) setSlug(slugify(e.target.value))
            }}
          />
        )}
      </FormField>
      <FormField label="Slug (in the web address)" required error={fieldErrors.slug}>
        {(field) => (
          <Input {...field} value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value)} />
        )}
      </FormField>
      <FormField label="Description" error={fieldErrors.description}>
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Icon">
          {(field) => (
            <NativeSelect {...field} value={iconKey} onChange={(e) => setIconKey(e.target.value)}>
              {iconKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Order" hint="Lower comes first" error={fieldErrors.sortOrder}>
          {(field) => (
            <Input
              {...field}
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          )}
        </FormField>
      </div>
    </EditDialog>
  )
}

function ServiceDialog({ categoryId, service }: { categoryId: string; service?: CatalogService }) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(service?.name ?? '')
  const [slug, setSlug] = useState(service?.slug ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [pricingUnit, setPricingUnit] = useState(service?.pricingUnit ?? 'PER_VISIT')
  const [duration, setDuration] = useState(String(service?.typicalDurationMin ?? 60))
  const [min, setMin] = useState<number | null>(service?.referenceMinPaise ?? null)
  const [max, setMax] = useState<number | null>(service?.referenceMaxPaise ?? null)
  const [searchTerms, setSearchTerms] = useState(service?.searchTerms ?? '')

  const save = () =>
    run(
      async () => {
        const body = {
          name,
          slug,
          description,
          pricingUnit,
          typicalDurationMin: Number(duration) || 0,
          referenceMinPaise: min,
          referenceMaxPaise: max,
          searchTerms,
        }
        await (service
          ? apiFetch(`/api/v1/admin/services/${service.id}`, { method: 'PATCH', body })
          : apiFetch('/api/v1/admin/services', { body: { ...body, categoryId } }))
        setOpen(false)
      },
      { success: service ? 'Service saved' : 'Service added' },
    )

  return (
    <EditDialog
      open={open}
      setOpen={setOpen}
      pending={pending}
      error={Object.keys(fieldErrors).length ? undefined : error}
      onSave={save}
      title={service ? `Edit ${service.name}` : 'Add a service'}
      trigger={
        service ? (
          <Button variant="tertiary" size="sm" aria-label={`Edit ${service.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button variant="secondary" size="sm">
            <Plus aria-hidden="true" />
            Add service
          </Button>
        )
      }
    >
      <FormField label="Name" required error={fieldErrors.name}>
        {(field) => (
          <Input
            {...field}
            value={name}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value)
              if (!service) setSlug(slugify(e.target.value))
            }}
          />
        )}
      </FormField>
      <FormField label="Slug" required error={fieldErrors.slug}>
        {(field) => (
          <Input {...field} value={slug} maxLength={80} onChange={(e) => setSlug(e.target.value)} />
        )}
      </FormField>
      <FormField label="Description" error={fieldErrors.description}>
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Priced">
          {(field) => (
            <NativeSelect
              {...field}
              value={pricingUnit}
              onChange={(e) => setPricingUnit(e.target.value)}
            >
              {UNITS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Typical minutes" error={fieldErrors.typicalDurationMin}>
          {(field) => (
            <Input
              {...field}
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          label="Reference from"
          hint="Guidance only"
          error={fieldErrors.referenceMinPaise}
        >
          {(field) => <MoneyInput {...field} value={min} onValueChange={setMin} />}
        </FormField>
        <FormField label="Reference to" error={fieldErrors.referenceMaxPaise}>
          {(field) => <MoneyInput {...field} value={max} onValueChange={setMax} />}
        </FormField>
      </div>
      <FormField label="Search words" hint="Synonyms, including Hinglish (e.g. nal, tap leak)">
        {(field) => (
          <Input
            {...field}
            value={searchTerms}
            maxLength={500}
            onChange={(e) => setSearchTerms(e.target.value)}
          />
        )}
      </FormField>
    </EditDialog>
  )
}

function ActiveToggle({
  endpoint,
  active,
  name,
}: {
  endpoint: string
  active: boolean
  name: string
}) {
  const { pending, run } = useApiAction()
  return (
    <Button
      variant={active ? 'destructive' : 'secondary'}
      size="sm"
      loading={pending}
      aria-label={`${active ? 'Hide' : 'Show'} ${name}`}
      onClick={() =>
        run(() => apiFetch(endpoint, { method: 'PATCH', body: { isActive: !active } }), {
          success: active ? `${name} hidden` : `${name} shown`,
        })
      }
    >
      {active ? 'Hide' : 'Show'}
    </Button>
  )
}

const UNIT_LABEL = Object.fromEntries(UNITS) as Record<string, string>

/** Categories and services; hiding replaces deleting, so old bookings keep their service. */
export function CatalogManager({
  categories,
  iconKeys,
}: {
  categories: CatalogCategory[]
  iconKeys: string[]
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <CategoryDialog iconKeys={iconKeys} />
      </div>
      {categories.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CategoryIcon iconKey={c.iconKey} />
                <div className="flex flex-col">
                  <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.name}
                    {!c.isActive && <Badge>Hidden</Badge>}
                  </h2>
                  <span className="text-xs text-ink-600">
                    /{c.slug} · order {c.sortOrder}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <CategoryDialog category={c} iconKeys={iconKeys} />
                <ActiveToggle
                  endpoint={`/api/v1/admin/categories/${c.id}`}
                  active={c.isActive}
                  name={c.name}
                />
                <ServiceDialog categoryId={c.id} />
              </div>
            </div>
            {c.services.length > 0 && (
              <Table label={`${c.name} services`}>
                <THead>
                  <tr>
                    <TH>Service</TH>
                    <TH>Priced</TH>
                    <TH>Typical time</TH>
                    <TH>Reference price</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {c.services.map((s) => (
                    <TR key={s.id} className={s.isActive ? undefined : 'bg-surface-muted'}>
                      <TD>
                        <span className="font-medium">{s.name}</span>
                        {!s.isActive && (
                          <Badge className="ml-2" tone="neutral">
                            Hidden
                          </Badge>
                        )}
                        <div className="text-xs text-ink-600">{s.slug}</div>
                      </TD>
                      <TD>{UNIT_LABEL[s.pricingUnit] ?? s.pricingUnit}</TD>
                      <TD>{s.typicalDurationMin} min</TD>
                      <TD className="whitespace-nowrap">
                        {s.referenceMinPaise !== null ? <Money paise={s.referenceMinPaise} /> : '–'}
                        {' – '}
                        {s.referenceMaxPaise !== null ? <Money paise={s.referenceMaxPaise} /> : '–'}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <ServiceDialog categoryId={c.id} service={s} />
                          <ActiveToggle
                            endpoint={`/api/v1/admin/services/${s.id}`}
                            active={s.isActive}
                            name={s.name}
                          />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
