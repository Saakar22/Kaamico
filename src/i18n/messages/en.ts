/**
 * English strings. The Hindi dictionary must have exactly these keys (`Messages`), so a
 * missing translation fails the type check. Placeholders look like `{name}`.
 */
export const en = {
  language: {
    switchTo: 'हिन्दी में देखें',
    switchLabel: 'Change language',
  },
  shell: {
    skipToContent: 'Skip to content',
    mainNav: 'Main',
    proNav: 'Professional',
    forProfessionals: 'For professionals',
  },
  nav: {
    home: 'Home',
    search: 'Search',
    bookings: 'Bookings',
    account: 'Account',
    requests: 'Requests',
    jobs: 'Jobs',
    earnings: 'Earnings',
  },
  notifications: {
    title: 'Notifications',
    titleUnread: 'Notifications, {count} unread',
    markAllRead: 'Mark all read',
    loadFailed: 'Could not load notifications.',
    tryAgain: 'Try again',
    empty: 'Nothing yet. Updates on your bookings appear here.',
    unread: 'Unread: ',
  },
  search: {
    label: 'What do you need help with?',
    placeholder: 'Try “plumber”, “AC service” or “nal”',
    submit: 'Search',
  },
  brand: {
    tagline: 'Local Skills. Fair Prices.',
    description:
      'Find trusted local plumbers, electricians, cleaners and more near you. Professionals set their own prices, and you can agree a fair price together.',
  },
  home: {
    categoriesTitle: 'What do you need help with?',
    allServices: 'All services',
    stepsTitle: 'How fair pricing works',
    step1Title: 'Compare real prices',
    step1Body:
      'Every professional sets their own price. See them side by side with ratings and distance.',
    step2Title: 'Accept or make an offer',
    step2Body: 'Book at the listed price, or suggest yours. Agree on a fair price together.',
    step3Title: 'Your price is locked',
    step3Body: 'Once agreed, the price cannot change. Any extra charge needs your OK first.',
    citiesTitle: 'Cities we serve',
    areaOne: '{count} area',
    areaOther: '{count} areas',
    trustTitle: 'Built on trust',
    trust1: 'ID checked by Kaamico before a professional can take jobs',
    trust2: 'Reviews only from customers who booked',
    trust3: 'Prices set by professionals themselves, with no hidden mark-up',
    prosTitle: 'Are you a professional?',
    prosBody: 'Set your own prices, choose your hours and get jobs near you.',
    prosCta: 'Join as a professional',
  },
}

type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Strings<T[K]> }
export type Messages = Strings<typeof en>
