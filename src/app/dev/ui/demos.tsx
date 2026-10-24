'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Checkbox, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { MoneyInput } from '@/components/ui/money-input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'

export function ButtonDemo() {
  const [loading, setLoading] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Book now</Button>
      <Button variant="secondary">Make an offer</Button>
      <Button variant="tertiary">View details</Button>
      <Button variant="destructive">Cancel booking</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
      <Button disabled>Disabled</Button>
      <Button
        loading={loading}
        loadingText="Sending offer…"
        onClick={() => {
          setLoading(true)
          setTimeout(() => setLoading(false), 1500)
        }}
      >
        Send offer
      </Button>
    </div>
  )
}

export function FormDemo() {
  const [offer, setOffer] = useState<number | null>(50_000)
  const [touched, setTouched] = useState(false)
  const offerError =
    touched && offer === null
      ? 'Enter an amount in rupees, like 650'
      : offer !== null && offer < 20_000
        ? 'Offers must be at least ₹200 for this service'
        : undefined

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField label="Full name" hint="As it should appear to professionals" required>
        {(control) => <Input autoComplete="name" placeholder="Priya Sharma" {...control} />}
      </FormField>
      <FormField label="Phone number" error="Enter a 10-digit Indian mobile number">
        {(control) => <Input type="tel" inputMode="numeric" defaultValue="98765" {...control} />}
      </FormField>
      <FormField
        label="Your offer"
        hint={
          <>
            Rakesh&apos;s listed price is <Money paise={65_000} />
          </>
        }
        error={offerError}
      >
        {(control) => (
          <MoneyInput
            value={offer}
            onValueChange={setOffer}
            onBlur={() => setTouched(true)}
            {...control}
          />
        )}
      </FormField>
      <FormField label="City">
        {(control) => (
          <NativeSelect defaultValue="pune" {...control}>
            <option value="pune">Pune</option>
            <option value="bengaluru">Bengaluru</option>
          </NativeSelect>
        )}
      </FormField>
      <FormField
        label="Describe the job"
        hint="Optional, up to 1000 characters"
        className="sm:col-span-2"
      >
        {(control) => (
          <Textarea maxLength={1000} placeholder="Kitchen tap is leaking…" {...control} />
        )}
      </FormField>
      <label className="flex items-center gap-3">
        <Checkbox defaultChecked />
        <span>Save this address</span>
      </label>
      <SwitchDemo />
    </div>
  )
}

function SwitchDemo() {
  const [online, setOnline] = useState(true)
  return (
    <div className="flex items-center gap-3">
      <Switch id="online" checked={online} onCheckedChange={setOnline} />
      <label htmlFor="online">{online ? 'Online: receiving requests' : 'Offline'}</label>
    </div>
  )
}

export function ChoiceDemo() {
  return (
    <RadioGroup defaultValue="listed" aria-label="Price" className="max-w-md">
      <RadioOption
        value="listed"
        label={
          <>
            Accept listed price · <Money paise={65_000} />
          </>
        }
        description="The professional still confirms before the booking is final."
      />
      <RadioOption
        value="offer"
        label="Make an offer"
        description="Suggest your price; they can accept or counter."
      />
      <RadioOption
        value="later"
        label="Decide later"
        description="Not available for this service."
        disabled
      />
    </RadioGroup>
  )
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="active">
      <TabsList aria-label="Bookings">
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="past">Past</TabsTrigger>
        <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
      </TabsList>
      <TabsContent value="active">One active booking.</TabsContent>
      <TabsContent value="upcoming">Two upcoming bookings.</TabsContent>
      <TabsContent value="past">No past bookings yet.</TabsContent>
      <TabsContent value="cancelled">Nothing cancelled.</TabsContent>
    </Tabs>
  )
}

export function OverlayDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive">Cancel booking…</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              Rakesh has not started travelling yet, so there is no cancellation fee.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep booking</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="destructive-solid"
                onClick={() => toast.success('Booking cancelled')}
              >
                Cancel booking
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">Choose location</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Where do you need help?</SheetTitle>
            <SheetDescription>We show professionals who serve this area.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-2">
            {['Kothrud, Pune', 'Baner, Pune', 'Indiranagar, Bengaluru'].map((place) => (
              <Button key={place} variant="tertiary" className="justify-start">
                {place}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Button
        variant="tertiary"
        onClick={() =>
          toast('Offer sent to Rakesh', { description: 'They have 10 minutes to respond.' })
        }
      >
        Show toast
      </Button>

      <Tooltip content="ID checked by Kaamico on 12 Oct 2026">
        <Button variant="tertiary" size="icon" aria-label="About verification">
          <Info aria-hidden="true" className="size-5" />
        </Button>
      </Tooltip>
    </div>
  )
}
