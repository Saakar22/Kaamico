import type { Messages } from './en'

/**
 * Hindi strings: plain everyday Hindi, keeping words people already use in English
 * (booking, professional, AC). Needs a review by a native speaker before launch.
 */
export const hi: Messages = {
  language: {
    switchTo: 'View in English',
    switchLabel: 'भाषा बदलें',
  },
  shell: {
    skipToContent: 'मुख्य सामग्री पर जाएँ',
    mainNav: 'मुख्य',
    proNav: 'प्रोफ़ेशनल',
    forProfessionals: 'प्रोफ़ेशनल्स के लिए',
  },
  nav: {
    home: 'होम',
    search: 'खोजें',
    bookings: 'बुकिंग',
    account: 'खाता',
    requests: 'अनुरोध',
    jobs: 'काम',
    earnings: 'कमाई',
  },
  notifications: {
    title: 'सूचनाएँ',
    titleUnread: 'सूचनाएँ, {count} नहीं पढ़ी गईं',
    markAllRead: 'सब पढ़ा हुआ करें',
    loadFailed: 'सूचनाएँ लोड नहीं हो सकीं।',
    tryAgain: 'फिर कोशिश करें',
    empty: 'अभी कुछ नहीं। आपकी बुकिंग की जानकारी यहाँ दिखेगी।',
    unread: 'नहीं पढ़ी: ',
  },
  search: {
    label: 'आपको किस काम में मदद चाहिए?',
    placeholder: '“प्लंबर”, “AC सर्विस” या “नल” लिखकर देखें',
    submit: 'खोजें',
  },
  brand: {
    tagline: 'स्थानीय हुनर। सही दाम।',
    description:
      'अपने पास भरोसेमंद प्लंबर, इलेक्ट्रीशियन, सफ़ाई वाले और भी बहुत कुछ पाएँ। प्रोफ़ेशनल अपना दाम ख़ुद तय करते हैं, और आप मिलकर सही दाम पर सहमत हो सकते हैं।',
  },
  home: {
    categoriesTitle: 'आपको किस काम में मदद चाहिए?',
    allServices: 'सभी सेवाएँ',
    stepsTitle: 'सही दाम कैसे तय होता है',
    step1Title: 'असली दाम की तुलना करें',
    step1Body:
      'हर प्रोफ़ेशनल अपना दाम ख़ुद तय करता है। रेटिंग और दूरी के साथ सबके दाम एक साथ देखें।',
    step2Title: 'दाम मानें या अपना ऑफ़र दें',
    step2Body: 'लिखे हुए दाम पर बुक करें, या अपना दाम बताएँ। मिलकर सही दाम तय करें।',
    step3Title: 'आपका दाम पक्का',
    step3Body:
      'तय होने के बाद दाम नहीं बदलता। कोई भी अतिरिक्त चार्ज पहले आपकी मंज़ूरी से ही लगेगा।',
    citiesTitle: 'हमारे शहर',
    areaOne: '{count} इलाका',
    areaOther: '{count} इलाके',
    trustTitle: 'भरोसे पर बना',
    trust1: 'काम लेने से पहले हर प्रोफ़ेशनल की ID Kaamico जाँचता है',
    trust2: 'रिव्यू सिर्फ़ उन्हीं ग्राहकों के जिन्होंने बुक किया',
    trust3: 'दाम प्रोफ़ेशनल ख़ुद तय करते हैं, कोई छुपा मुनाफ़ा नहीं',
    prosTitle: 'क्या आप प्रोफ़ेशनल हैं?',
    prosBody: 'अपने दाम ख़ुद तय करें, अपने घंटे चुनें और पास में काम पाएँ।',
    prosCta: 'प्रोफ़ेशनल के रूप में जुड़ें',
  },
}
