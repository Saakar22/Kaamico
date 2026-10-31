// Hindi names and descriptions for the demo catalog, by slug (IMPLEMENTATION_PLAN.md §14,
// P2). Everyday Hindi with the English words people actually use (AC, RO, MCB). Needs a
// review by a native speaker before launch. Anything missing falls back to English.

type Hindi = { name: string; description: string }

export const CATEGORIES_HI: Record<string, Hindi> = {
  plumbing: { name: 'प्लंबिंग', description: 'नल, लीकेज, टॉयलेट, नाली और पानी की टंकी।' },
  electrical: { name: 'बिजली का काम', description: 'स्विच, पंखे, लाइट, वायरिंग और MCB।' },
  carpentry: { name: 'बढ़ई का काम', description: 'फ़र्नीचर की मरम्मत, जोड़ना, दरवाज़े और ताले।' },
  painting: { name: 'पेंटिंग', description: 'कमरे की पेंटिंग, टच-अप और पॉलिश।' },
  cleaning: { name: 'सफ़ाई', description: 'बाथरूम, किचन, सोफ़ा और पूरे घर की सफ़ाई।' },
  cooking: { name: 'खाना बनाने वाले', description: 'रोज़ का खाना और घर पर पार्टी का खाना।' },
  'house-help': { name: 'घर का काम', description: 'रोज़ की मदद, बर्तन, कपड़े धोना और इस्त्री।' },
  'appliance-repair': {
    name: 'उपकरण मरम्मत',
    description: 'AC, फ़्रिज, वॉशिंग मशीन और पानी का प्यूरीफ़ायर।',
  },
  'pest-control': { name: 'कीट नियंत्रण', description: 'कॉकरोच, दीमक और खटमल।' },
  handyman: { name: 'छोटे-मोटे काम', description: 'टांगना, ड्रिल करना और छोटी मरम्मत।' },
}

export const SERVICES_HI: Record<string, Hindi> = {
  'tap-repair': { name: 'नल की मरम्मत या बदलना', description: 'टपकता नल ठीक करें या नया लगवाएँ।' },
  'pipe-leak': { name: 'पाइप लीकेज की मरम्मत', description: 'रिसते पाइप और जोड़ ढूँढकर ठीक करना।' },
  'toilet-repair': {
    name: 'टॉयलेट और फ़्लश की मरम्मत',
    description: 'फ़्लश टैंक, सीट और रुकावट।',
  },
  'drain-unblock': {
    name: 'नाली खोलना',
    description: 'बंद सिंक, वॉश बेसिन और फ़र्श की नाली साफ़ करना।',
  },
  'tank-cleaning': {
    name: 'पानी की टंकी की सफ़ाई',
    description: 'छत की या ज़मीन के नीचे की टंकी की सफ़ाई।',
  },
  'switch-repair': {
    name: 'स्विच और सॉकेट की मरम्मत',
    description: 'स्विच और सॉकेट ठीक करना या बदलना।',
  },
  'fan-installation': {
    name: 'पंखा लगाना',
    description: 'छत या दीवार का पंखा लगाना या बदलना।',
  },
  'light-fitting': {
    name: 'लाइट फ़िटिंग',
    description: 'ट्यूबलाइट, LED पैनल और सजावटी लाइटें।',
  },
  wiring: {
    name: 'वायरिंग जाँच और मरम्मत',
    description: 'घर की वायरिंग में ख़राबी ढूँढकर ठीक करना।',
  },
  'mcb-repair': {
    name: 'MCB और फ़्यूज़ की मरम्मत',
    description: 'बार-बार गिरने वाले MCB और उड़े फ़्यूज़ बदलना।',
  },
  'furniture-repair': {
    name: 'फ़र्नीचर की मरम्मत',
    description: 'बेड, कुर्सी, मेज़ और अलमारी ठीक करना।',
  },
  'door-lock': { name: 'दरवाज़े का ताला लगाना', description: 'ताले और कुंडी लगाना या बदलना।' },
  'furniture-assembly': { name: 'फ़र्नीचर जोड़ना', description: 'डिब्बे में आया फ़र्नीचर जोड़ना।' },
  'hinge-repair': {
    name: 'दरवाज़े और कैबिनेट के क़ब्ज़े की मरम्मत',
    description: 'झुके दरवाज़े और ढीले क़ब्ज़े ठीक करना।',
  },
  'room-painting': { name: 'कमरे की पेंटिंग', description: 'एक कमरे की दीवारें और छत पेंट करना।' },
  'touch-up': {
    name: 'टच-अप पेंटिंग',
    description: 'निशान और छोटी जगहों पर भराई करके दोबारा पेंट।',
  },
  'wood-polish': {
    name: 'दरवाज़े और फ़र्नीचर की पॉलिश',
    description: 'लकड़ी के दरवाज़ों और फ़र्नीचर की पॉलिश।',
  },
  'bathroom-cleaning': { name: 'बाथरूम की सफ़ाई', description: 'एक बाथरूम की गहरी सफ़ाई।' },
  'kitchen-cleaning': {
    name: 'किचन की सफ़ाई',
    description: 'किचन से चिकनाई हटाकर गहरी सफ़ाई।',
  },
  'home-cleaning': { name: 'पूरे घर की सफ़ाई', description: '1–3 BHK घर की गहरी सफ़ाई।' },
  'sofa-cleaning': { name: 'सोफ़ा की सफ़ाई', description: 'सोफ़े की शैम्पू से धुलाई और वैक्यूम।' },
  'daily-cook': {
    name: 'रोज़ का कुक (2 समय का खाना)',
    description: 'आपके घर पर घर जैसा खाना।',
  },
  'party-cook': { name: 'पार्टी का खाना', description: '30 मेहमानों तक के लिए खाना बनाना।' },
  'daily-help': { name: 'रोज़ की घरेलू मदद', description: 'झाड़ू, पोछा और धूल साफ़ करना।' },
  utensils: { name: 'बर्तन धोना', description: 'बर्तन धोकर जगह पर रखना।' },
  laundry: { name: 'कपड़े धोना और इस्त्री', description: 'कपड़े धोना, सुखाना और इस्त्री करना।' },
  'ac-service': {
    name: 'AC सर्विस',
    description: 'स्प्लिट या विंडो AC के फ़िल्टर और कॉइल की सफ़ाई।',
  },
  'ac-repair': { name: 'AC मरम्मत विज़िट', description: 'ठंडक की समस्या ढूँढकर ठीक करना।' },
  'fridge-repair': { name: 'फ़्रिज की मरम्मत', description: 'फ़्रिज की ख़राबी ढूँढकर ठीक करना।' },
  'washing-machine-repair': {
    name: 'वॉशिंग मशीन की मरम्मत',
    description: 'वॉशिंग मशीन की ख़राबी ढूँढकर ठीक करना।',
  },
  'ro-service': {
    name: 'पानी के प्यूरीफ़ायर की सर्विस',
    description: 'RO प्यूरीफ़ायर का फ़िल्टर बदलना और सर्विस।',
  },
  'cockroach-control': {
    name: 'कॉकरोच का इलाज',
    description: 'घर के लिए जेल और स्प्रे से इलाज।',
  },
  'termite-control': { name: 'दीमक का इलाज', description: 'ड्रिल करके दवा भरकर सील करना।' },
  'bed-bug-control': { name: 'खटमल का इलाज', description: 'दो बार आकर खटमल का इलाज।' },
  'tv-mounting': { name: 'TV दीवार पर लगाना', description: 'TV को दीवार के ब्रैकेट पर लगाना।' },
  'curtain-rod': { name: 'पर्दे की रॉड लगाना', description: 'पर्दे की रॉड और ब्रैकेट लगाना।' },
  'wall-drilling': {
    name: 'दीवार में ड्रिल और टांगना',
    description: 'फ़्रेम, शेल्फ़ और शीशे ड्रिल करके टांगना।',
  },
  'general-handyman': {
    name: 'घर के छोटे-मोटे काम',
    description: 'घर में छोटी मरम्मत का एक घंटा।',
  },
}
