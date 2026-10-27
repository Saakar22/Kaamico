import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/patterns/legal-page'

export const metadata: Metadata = { title: 'Privacy policy' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="28 October 2026">
      <p>
        Kaamico connects people who need household services with local professionals. This page
        explains what we collect, why, who sees it and how long we keep it. It is written to follow
        India&apos;s Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your mobile number, to sign you in with a one-time code, and your name.</li>
        <li>An email address, only if you add one.</li>
        <li>
          Addresses you save for bookings, and your approximate location if you allow it (to find
          professionals near you).
        </li>
        <li>Your bookings, offers, messages, payments, reviews and help requests.</li>
        <li>
          For professionals: profile, skills, prices, working hours and area, and identity documents
          for verification.
        </li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>
          Professionals see your first name, area and distance before a booking is confirmed. They
          see your full address only once it is confirmed, and for 24 hours after the job.
        </li>
        <li>
          Your phone number is never shown to the other side. Phone numbers, emails and UPI IDs
          typed into messages are hidden.
        </li>
        <li>
          Identity documents are seen only by Kaamico staff reviewing a verification, through links
          that expire after 5 minutes. Every view is logged.
        </li>
        <li>
          Public profiles show a professional&apos;s name, photo, services, prices and reviews.
        </li>
      </ul>

      <h2>Identity documents</h2>
      <p>
        We never store a full Aadhaar number: we ask for a masked Aadhaar or another ID, and keep
        only the last four characters of the number. Photo metadata, including location, is removed
        on upload. Document files are deleted 90 days after a verification decision; the decision
        and basic details are kept.
      </p>

      <h2>Payments</h2>
      <p>
        Online payments are handled by our payment provider; we never see or store card or UPI PIN
        details. In this demo, online payments and payouts are simulated and no money moves.
      </p>

      <h2>Service providers</h2>
      <p>
        We use hosting, storage, SMS, payment and error-reporting providers to run Kaamico. They
        process data only on our instructions. Error reports are stripped of phone numbers, emails
        and other personal details before they are sent.
      </p>

      <h2>How long we keep data</h2>
      <ul>
        <li>Booking, payment and receipt records: as long as tax and accounting law requires.</li>
        <li>Identity document files: 90 days after the verification decision.</li>
        <li>Sign-in sessions: 30 days after last use (8 hours for staff).</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can see and correct your details on your account page, and ask us to delete your account
        or explain how your data is used through{' '}
        <Link href="/support" className="font-medium text-brand-700 underline">
          Help and support
        </Link>
        . We may keep records the law requires us to keep.
      </p>
    </LegalPage>
  )
}
