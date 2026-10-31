import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/patterns/legal-page'

export const metadata: Metadata = { title: 'Terms of use' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="28 October 2026">
      <p>
        Kaamico is a marketplace. Professionals are independent: they set their own prices and do
        the work. Kaamico helps you find each other, agree a price, and keeps a record of the job.
      </p>

      <h2>Prices and offers</h2>
      <ul>
        <li>
          Each professional sets their price. You can accept it or suggest another, within limits
          shown when you book.
        </li>
        <li>
          Once both sides accept, the price is locked. Extra charges apply only if you approve them
          during the job.
        </li>
        <li>Arrival times are estimates based on distance.</li>
      </ul>

      <h2>Cancelling</h2>
      <ul>
        <li>Cancelling is free until the professional sets off.</li>
        <li>
          After that, a visit fee of up to ₹99 (never more than the professional&apos;s minimum
          charge) may apply. Once work has started, a booking cannot be cancelled; report a problem
          instead.
        </li>
        <li>
          Professionals who cancel confirmed jobs, or do not turn up, lose reliability and may be
          removed.
        </li>
      </ul>

      <h2>Paying</h2>
      <p>
        You pay once the job is complete: in cash to the professional, or online. Kaamico keeps a
        fee from the professional&apos;s earnings (10% unless shown otherwise). Receipts are booking
        receipts, not GST tax invoices. In this demo, online payments and payouts are simulated.
      </p>

      <h2>Problems and refunds</h2>
      <p>
        You can report a problem during a job (safety) or up to 72 hours after it. Kaamico reviews
        the booking history and both sides&apos; account and may refund some or all of a payment. In
        an emergency, call 112 first.
      </p>

      <h2>Reviews and conduct</h2>
      <ul>
        <li>Only customers who completed a booking can review it, within 14 days.</li>
        <li>
          Be respectful. Do not share contact details to take a job off Kaamico, post abusive
          reviews, or misuse the service. We may hide content or suspend accounts that do.
        </li>
      </ul>

      <h2>Professionals</h2>
      <p>
        Professionals must pass identity verification before customers can book them, keep their
        details accurate, and hold any licences their trade requires.
      </p>

      <p>
        Questions? Use{' '}
        <Link href="/support" className="font-medium text-brand-700 underline">
          Help and support
        </Link>
        . See also our{' '}
        <Link href="/privacy" className="font-medium text-brand-700 underline">
          privacy policy
        </Link>
        .
      </p>
    </LegalPage>
  )
}
