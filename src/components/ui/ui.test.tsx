// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { FormField } from './form-field'
import { Input } from './input'
import { Money } from './money'
import { MoneyInput } from './money-input'

describe('cn', () => {
  it('lets the last conflicting Kaamico token win', () => {
    expect(cn('text-ink-600 px-2', 'text-brand-700')).toBe('px-2 text-brand-700')
    expect(cn('bg-brand-600', false, 'bg-danger-700')).toBe('bg-danger-700')
  })
})

describe('Money', () => {
  it('renders Indian-grouped rupees', () => {
    render(<Money paise={10_000_000} />)
    expect(screen.getByText('₹1,00,000')).toBeTruthy()
  })
})

describe('Button', () => {
  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })

  it('disables itself and shows the loading text while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingText="Sending offer…" onClick={onClick}>
        Send offer
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Sending offer…' })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('FormField', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <FormField label="Phone number" hint="10 digits" error="Enter a valid number" required>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const input = screen.getByLabelText(/Phone number/)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.hasAttribute('required')).toBe(true)
    const describedBy = input.getAttribute('aria-describedby')!.split(' ')
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent)
    expect(texts).toEqual(['Enter a valid number', '10 digits'])
  })

  it('omits aria-invalid and aria-describedby when there is nothing to describe', () => {
    render(<FormField label="Name">{(control) => <Input {...control} />}</FormField>)
    const input = screen.getByLabelText('Name')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('MoneyInput', () => {
  function Harness({ initial = null }: { initial?: number | null }) {
    const [value, setValue] = useState<number | null>(initial)
    return (
      <>
        <label htmlFor="amount">Amount</label>
        <MoneyInput id="amount" value={value} onValueChange={setValue} />
        <output data-testid="paise">{String(value)}</output>
      </>
    )
  }

  it('reports paise as the user types and re-groups on blur', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Amount') as HTMLInputElement
    await user.type(input, '100000.5')
    expect(screen.getByTestId('paise').textContent).toBe('10000050')
    await user.tab()
    expect(input.value).toBe('1,00,000.5')
  })

  it('reports null for invalid input and keeps the text so the user can fix it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={65_000} />)
    const input = screen.getByLabelText('Amount') as HTMLInputElement
    expect(input.value).toBe('650')
    await user.clear(input)
    await user.type(input, '6.5.0')
    await user.tab()
    expect(screen.getByTestId('paise').textContent).toBe('null')
    expect(input.value).toBe('6.5.0')
  })
})
