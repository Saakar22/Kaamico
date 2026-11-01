# Demo guide

A walkthrough of the three journeys on freshly seeded data (`npm run db:reset`, then restart `npm run dev`). Use two browser windows, one of them private, so the customer and the professional can be signed in at once. Every code is shown on screen; nothing is sent.

**1. Customer: find and book (≈ 4 min).** Sign in at `/login` as Priya (`90000 00001`). The dashboard already shows an upcoming confirmed booking and a request waiting for Rakesh. Search "plumber" from the home page: cards show the distance, an arrival _estimate_, the price and the rating. Sort by price, open a profile, choose **Request booking**, add an address in Kothrud, pick a time, and choose **Suggest a different price** below the listed one.

**2. Professional: answer and do the job (≈ 3 min).** In the other window sign in as Rakesh (`90000 00101`). The dashboard lists Priya's tap-repair request and Aditya's fan installation, where Aditya owes a reply. Open a request and counter it; back as the customer, accept the counter on `/bookings/:id/negotiate`. The booking shows **Price locked** and a 4-digit start code. As Rakesh, open the job under **Bookings** and tap **I'm on my way**, then **I've arrived**, enter the start code, optionally add an extra charge (the customer must approve it), then **Mark job complete**.

**3. Pay and review (≈ 1 min).** As the customer, pay with the simulated checkout (marked "Simulated"), open the receipt, and leave a review. As Rakesh, `/worker/earnings` shows the job's gross, Kaamico's 10% fee and the net.

**4. Admin (≈ 2 min).** Sign in at `/admin/login` as `admin@kaamico.local` with `SEED_ADMIN_PASSWORD`. Open the pending application under **Verifications**: documents open through a short-lived link and each view lands in the audit log. Ask for new documents or approve; the professional gets a notification. Inspect any booking's full history under **Bookings**, suspend a user under **Users**, and see every action under **Audit log**.

What is simulated, and says so on screen: phone OTP, online payments, payouts and arrival times (straight-line distance, labelled "estimate"). Receipts are not GST tax invoices.
