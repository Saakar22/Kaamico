ALTER TABLE "service_categories" ADD COLUMN "name_hi" varchar(80);--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "description_hi" varchar(300);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "name_hi" varchar(100);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "description_hi" varchar(500);
--> statement-breakpoint
-- Hindi text for the catalog already in the database (by slug); new seeds get it directly.
UPDATE "service_categories" SET "name_hi" = 'प्लंबिंग', "description_hi" = 'नल, लीकेज, टॉयलेट, नाली और पानी की टंकी।' WHERE "slug" = 'plumbing';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'बिजली का काम', "description_hi" = 'स्विच, पंखे, लाइट, वायरिंग और MCB।' WHERE "slug" = 'electrical';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'बढ़ई का काम', "description_hi" = 'फ़र्नीचर की मरम्मत, जोड़ना, दरवाज़े और ताले।' WHERE "slug" = 'carpentry';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'पेंटिंग', "description_hi" = 'कमरे की पेंटिंग, टच-अप और पॉलिश।' WHERE "slug" = 'painting';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'सफ़ाई', "description_hi" = 'बाथरूम, किचन, सोफ़ा और पूरे घर की सफ़ाई।' WHERE "slug" = 'cleaning';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'खाना बनाने वाले', "description_hi" = 'रोज़ का खाना और घर पर पार्टी का खाना।' WHERE "slug" = 'cooking';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'घर का काम', "description_hi" = 'रोज़ की मदद, बर्तन, कपड़े धोना और इस्त्री।' WHERE "slug" = 'house-help';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'उपकरण मरम्मत', "description_hi" = 'AC, फ़्रिज, वॉशिंग मशीन और पानी का प्यूरीफ़ायर।' WHERE "slug" = 'appliance-repair';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'कीट नियंत्रण', "description_hi" = 'कॉकरोच, दीमक और खटमल।' WHERE "slug" = 'pest-control';--> statement-breakpoint
UPDATE "service_categories" SET "name_hi" = 'छोटे-मोटे काम', "description_hi" = 'टांगना, ड्रिल करना और छोटी मरम्मत।' WHERE "slug" = 'handyman';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'नल की मरम्मत या बदलना', "description_hi" = 'टपकता नल ठीक करें या नया लगवाएँ।' WHERE "slug" = 'tap-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पाइप लीकेज की मरम्मत', "description_hi" = 'रिसते पाइप और जोड़ ढूँढकर ठीक करना।' WHERE "slug" = 'pipe-leak';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'टॉयलेट और फ़्लश की मरम्मत', "description_hi" = 'फ़्लश टैंक, सीट और रुकावट।' WHERE "slug" = 'toilet-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'नाली खोलना', "description_hi" = 'बंद सिंक, वॉश बेसिन और फ़र्श की नाली साफ़ करना।' WHERE "slug" = 'drain-unblock';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पानी की टंकी की सफ़ाई', "description_hi" = 'छत की या ज़मीन के नीचे की टंकी की सफ़ाई।' WHERE "slug" = 'tank-cleaning';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'स्विच और सॉकेट की मरम्मत', "description_hi" = 'स्विच और सॉकेट ठीक करना या बदलना।' WHERE "slug" = 'switch-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पंखा लगाना', "description_hi" = 'छत या दीवार का पंखा लगाना या बदलना।' WHERE "slug" = 'fan-installation';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'लाइट फ़िटिंग', "description_hi" = 'ट्यूबलाइट, LED पैनल और सजावटी लाइटें।' WHERE "slug" = 'light-fitting';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'वायरिंग जाँच और मरम्मत', "description_hi" = 'घर की वायरिंग में ख़राबी ढूँढकर ठीक करना।' WHERE "slug" = 'wiring';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'MCB और फ़्यूज़ की मरम्मत', "description_hi" = 'बार-बार गिरने वाले MCB और उड़े फ़्यूज़ बदलना।' WHERE "slug" = 'mcb-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'फ़र्नीचर की मरम्मत', "description_hi" = 'बेड, कुर्सी, मेज़ और अलमारी ठीक करना।' WHERE "slug" = 'furniture-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'दरवाज़े का ताला लगाना', "description_hi" = 'ताले और कुंडी लगाना या बदलना।' WHERE "slug" = 'door-lock';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'फ़र्नीचर जोड़ना', "description_hi" = 'डिब्बे में आया फ़र्नीचर जोड़ना।' WHERE "slug" = 'furniture-assembly';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'दरवाज़े और कैबिनेट के क़ब्ज़े की मरम्मत', "description_hi" = 'झुके दरवाज़े और ढीले क़ब्ज़े ठीक करना।' WHERE "slug" = 'hinge-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'कमरे की पेंटिंग', "description_hi" = 'एक कमरे की दीवारें और छत पेंट करना।' WHERE "slug" = 'room-painting';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'टच-अप पेंटिंग', "description_hi" = 'निशान और छोटी जगहों पर भराई करके दोबारा पेंट।' WHERE "slug" = 'touch-up';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'दरवाज़े और फ़र्नीचर की पॉलिश', "description_hi" = 'लकड़ी के दरवाज़ों और फ़र्नीचर की पॉलिश।' WHERE "slug" = 'wood-polish';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'बाथरूम की सफ़ाई', "description_hi" = 'एक बाथरूम की गहरी सफ़ाई।' WHERE "slug" = 'bathroom-cleaning';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'किचन की सफ़ाई', "description_hi" = 'किचन से चिकनाई हटाकर गहरी सफ़ाई।' WHERE "slug" = 'kitchen-cleaning';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पूरे घर की सफ़ाई', "description_hi" = '1–3 BHK घर की गहरी सफ़ाई।' WHERE "slug" = 'home-cleaning';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'सोफ़ा की सफ़ाई', "description_hi" = 'सोफ़े की शैम्पू से धुलाई और वैक्यूम।' WHERE "slug" = 'sofa-cleaning';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'रोज़ का कुक (2 समय का खाना)', "description_hi" = 'आपके घर पर घर जैसा खाना।' WHERE "slug" = 'daily-cook';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पार्टी का खाना', "description_hi" = '30 मेहमानों तक के लिए खाना बनाना।' WHERE "slug" = 'party-cook';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'रोज़ की घरेलू मदद', "description_hi" = 'झाड़ू, पोछा और धूल साफ़ करना।' WHERE "slug" = 'daily-help';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'बर्तन धोना', "description_hi" = 'बर्तन धोकर जगह पर रखना।' WHERE "slug" = 'utensils';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'कपड़े धोना और इस्त्री', "description_hi" = 'कपड़े धोना, सुखाना और इस्त्री करना।' WHERE "slug" = 'laundry';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'AC सर्विस', "description_hi" = 'स्प्लिट या विंडो AC के फ़िल्टर और कॉइल की सफ़ाई।' WHERE "slug" = 'ac-service';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'AC मरम्मत विज़िट', "description_hi" = 'ठंडक की समस्या ढूँढकर ठीक करना।' WHERE "slug" = 'ac-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'फ़्रिज की मरम्मत', "description_hi" = 'फ़्रिज की ख़राबी ढूँढकर ठीक करना।' WHERE "slug" = 'fridge-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'वॉशिंग मशीन की मरम्मत', "description_hi" = 'वॉशिंग मशीन की ख़राबी ढूँढकर ठीक करना।' WHERE "slug" = 'washing-machine-repair';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पानी के प्यूरीफ़ायर की सर्विस', "description_hi" = 'RO प्यूरीफ़ायर का फ़िल्टर बदलना और सर्विस।' WHERE "slug" = 'ro-service';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'कॉकरोच का इलाज', "description_hi" = 'घर के लिए जेल और स्प्रे से इलाज।' WHERE "slug" = 'cockroach-control';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'दीमक का इलाज', "description_hi" = 'ड्रिल करके दवा भरकर सील करना।' WHERE "slug" = 'termite-control';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'खटमल का इलाज', "description_hi" = 'दो बार आकर खटमल का इलाज।' WHERE "slug" = 'bed-bug-control';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'TV दीवार पर लगाना', "description_hi" = 'TV को दीवार के ब्रैकेट पर लगाना।' WHERE "slug" = 'tv-mounting';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'पर्दे की रॉड लगाना', "description_hi" = 'पर्दे की रॉड और ब्रैकेट लगाना।' WHERE "slug" = 'curtain-rod';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'दीवार में ड्रिल और टांगना', "description_hi" = 'फ़्रेम, शेल्फ़ और शीशे ड्रिल करके टांगना।' WHERE "slug" = 'wall-drilling';--> statement-breakpoint
UPDATE "services" SET "name_hi" = 'घर के छोटे-मोटे काम', "description_hi" = 'घर में छोटी मरम्मत का एक घंटा।' WHERE "slug" = 'general-handyman';--> statement-breakpoint
-- Hindi names are searchable too ("नल" finds tap repair).
UPDATE "services" s SET "search_terms" = trim(s."search_terms" || ' ' || coalesce(c."name_hi", '') || ' ' || s."name_hi") FROM "service_categories" c WHERE c."id" = s."category_id" AND s."name_hi" IS NOT NULL AND position(s."name_hi" in s."search_terms") = 0;
