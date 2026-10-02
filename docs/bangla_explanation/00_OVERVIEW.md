# Chirp প্ল্যাটফর্ম রিফ্যাক্টরিং টেস্ট - সম্পূর্ণ বিস্তারিত গাইডলাইন (বাংলায়)

এই ডকুমেন্টে আমরা সহজ এবং বিস্তারিত বাংলায় বুঝবো পুরো প্রজেক্টটি কী ছিল, কী কী সমস্যা ছিল, কীভাবে আমরা চিন্তা করলাম এবং ধাপে ধাপে কীভাবে সব সমাধান করা হলো।

---

## 🏗️ ১. প্রজেক্টের ব্যাকগ্রাউন্ড (Chirp কী?)

**Chirp** হলো টুইটার (Twitter / X) এর মতো একটি সোশ্যাল মিডিয়া প্ল্যাটফর্মের মনোরিপো (Monorepo) কোডবেস। 

### মনোরিপোর ভেতরের অংশগুলো:
1. **`apps/api`**: ব্যাকএন্ড সার্ভার (Node.js + TypeScript + gRPC)। ডাটাবেজের সাথে যোগাযোগ করে এবং বিজনেস লজিক হ্যান্ডেল করে।
2. **`apps/client-user`**: সাধারণ ইউজারদের জন্য ফ্রন্টএন্ড ওয়েব অ্যাপ (React + TanStack Start/Router)।
3. **`apps/client-admin`**: অ্যাডমিনদের জন্য ড্যাশবোর্ড (React + TanStack Start/Router)।
4. **`packages/proto`**: ব্যাকএন্ড ও ফ্রন্টএন্ডের মধ্যে gRPC প্রটোকল বাফার (Protobuf) ডেফিনিশন।
5. **`packages/db-schema`**: ডাটাবেজ টেবিলের গঠন (Drizzle ORM + SQLite/LibSQL)।

---

## 🎯 ২. যে ৫টি মূল সমস্যা (Issues) সমাধান করতে বলা হয়েছিল

| পর্ব | বিষয়ের নাম | মূল সমস্যা কী ছিল? | আমরা কীভাবে সমাধান করলাম? |
| :--- | :--- | :--- | :--- |
| **Issue 1** | **পাসওয়ার্ড সিকিউরিটি ও টোকেন ট্রাস্ট** | পাসওয়ার্ড দুর্বল হ্যাশিং (SHA-256) এবং স্ট্যাটিক সল্ট ছিল। তাছাড়া ফ্রন্টএন্ড নিজে নিজেই JWT টোকেন তৈরি করতো (Fake Trust)। | আধুনিক মেমোরি-হার্ড `scrypt` অ্যালগরিদম ও র‍্যান্ডম সল্ট ব্যবহার করা হলো। API সার্ভারকে একমাত্র টোকেন ইস্যুকারী করা হলো এবং পুরানো ইউজারদের ব্যাকওয়ার্ডস কম্প্যাটিবল অটো-মাইগ্রেশন দেয়া হলো। |
| **Issue 2** | **ডাটাবেজ কুয়েরি পারফরম্যান্স ($N+1$)** | হোম ফিড, বুকমার্ক ও প্রোফাইলে প্রতিটি পোস্টের জন্য লুপ চালিয়ে আলাদা আলাদা ডাটাবেজ কুয়েরি পাঠানো হতো। ১০টি পোস্ট আসলে ৩০-৪০টি কুয়েরি চলতো। | একটি রিইউজেবল ব্যাচ হাইড্রেটর (`enrichPostsWithCounts`) তৈরি করে single `GROUP BY` কুয়েরিতে সব কাউন্ট এনে কুয়েরির সংখ্যা ৮০-৮৭% কমানো হলো। |
| **Issue 3** | **এরর হ্যান্ডলিং ও অবজারভেবিলিটি** | এরর মেসেজ স্ট্রিং হিসেবে ছিটকে পড়তো, gRPC কোড ঠিক ছিল না, রিকোয়েস্ট ট্র্যাক করার কোনো Trace ID বা স্ট্রাকচার্ড লগিং ছিল না। | ইউনিফায়েড `AppError` ট্যাক্সোনমি, `AsyncLocalStorage` ভিত্তিক `x-trace-id` ট্রেসিং এবং সেন্ট্রাল ইন্টারসেপ্টর দিয়ে স্ট্রাকচার্ড JSON লগিং যোগ করা হলো। |
| **Issue 4** | **টেস্ট ইনফ্রাস্ট্রাকচার ও কভারেজ গ্যাপ** | অনেকগুলো সার্ভিসের কোনো টেস্ট ছিল না। SQLite মেমোরি টেস্টে Foreign Key অফ ছিল, যার ফলে ভুল রিলেশন ধরা পড়তো না। | `PRAGMA foreign_keys = ON;` দিয়ে আইসোলেশন ফিক্স করা হলো এবং `bookmarks`, `feed`, `search`, `users` সার্ভিসের সম্পূর্ণ ইউনিট টেস্ট লেখা হলো। |
| **Task 5** | **বিল্ড পাইপলাইন ও ডেভ-এক্সপেরিয়েন্স** | Turborepo তে বিল্ড ডিপেন্ডেন্সি ঠিক ছিল না, কোনো অটোমেটিক CI পাইপলাইন বা প্রি-কমিট হুক ছিল না। | `.github/workflows/ci.yml` তৈরি করা হলো, `turbo.json` এ সঠিক ক্যাশিং ও টাস্ক গ্রাফ দেওয়া হলো এবং < ৫০ লাইনের সহজ `SETUP.md` লেখা হলো। |

---

## 📚 প্রতিটি বিষয়ের আলাদা বিস্তারিত ফাইল সূচি:

1. 📄 [Issue 1: পাসওয়ার্ড সিকিউরিটি ও টোকেন ট্রাস্ট বিস্তারিত](file:///Users/mdanwarhossain/Desktop/Speechify%20Test/llm-base-refactoring-test-04c1ec6d-20261002/docs/bangla_explanation/01_ISSUE_1_CREDENTIALS_AND_AUTH.md)
2. 📄 [Issue 2: ডাটাবেজ পারফরম্যান্স ও N+1 কুয়েরি সমাধান বিস্তারিত](file:///Users/mdanwarhossain/Desktop/Speechify%20Test/llm-base-refactoring-test-04c1ec6d-20261002/docs/bangla_explanation/02_ISSUE_2_QUERY_PERFORMANCE_N_PLUS_1.md)
3. 📄 [Issue 3: এরর হ্যান্ডলিং, ট্রেসিং ও লগিং বিস্তারিত](file:///Users/mdanwarhossain/Desktop/Speechify%20Test/llm-base-refactoring-test-04c1ec6d-20261002/docs/bangla_explanation/03_ISSUE_3_OBSERVABILITY_AND_ERRORS.md)
4. 📄 [Issue 4: টেস্ট ইনফ্রাস্ট্রাকচার ও কভারেজ গ্যাপ বিস্তারিত](file:///Users/mdanwarhossain/Desktop/Speechify%20Test/llm-base-refactoring-test-04c1ec6d-20261002/docs/bangla_explanation/04_ISSUE_4_TEST_INFRASTRUCTURE.md)
5. 📄 [Task 5: বিল্ড পাইপলাইন, CI ও Turborepo কনফিগারেশন বিস্তারিত](file:///Users/mdanwarhossain/Desktop/Speechify%20Test/llm-base-refactoring-test-04c1ec6d-20261002/docs/bangla_explanation/05_TASK_5_CI_CD_BUILD_PIPELINE.md)
