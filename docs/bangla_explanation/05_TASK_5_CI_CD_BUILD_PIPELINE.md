# Task 5: বিল্ড পাইপলাইন, CI/CD ও ডেভেলপার এক্সপেরিয়েন্স (Build Pipeline & DevEx)

## ১. সমস্যা কী ছিল? (সহজ ভাষায়)

### সমস্যা ক: Turborepo তে বিল্ডের সঠিক অর্ডার ছিল না (`turbo.json`)
- কোডবেসে TypeScript টাইপ তৈরি হয় Protobuf ফাইল থেকে (`pnpm run proto:generate`)।
- কিন্তু `turbo.json` এ `build`, `lint`, বা `typecheck` কে বলা ছিল না যে আগে `proto:generate` শেষ হতে হবে!
- ফলে ফ্রেশ ক্লোন করে বিল্ড দিলে Protobuf এর টাইপ ফাইল না পেয়ে সাথে সাথে পুরো বিল্ড ফেইল করতো।
- এছাড়া ডাটাবেজ মাইগ্রেশন এবং সিড (`db:migrate`, `db:seed`) এর কাজ ক্যাশ হয়ে যাচ্ছিল, যার ফলে নতুন মাইগ্রেশন রান হতো না।

### সমস্যা খ: কোনো অটোমেটেড CI পাইপলাইন ও প্রি-কমিট হুক ছিল না
- গিথাবে কোড পুশ বা PR করার পর স্বয়ংক্রিয়ভাবে টেস্ট বা বিল্ড চেক করার কোনো GitHub Actions ফাইল ছিল না।
- ডেভেলপারদের জন্য কোডবেস সেটআপের সহজ কোনো গাইড ছিল না।

---

## ২. আমরা কীভাবে চিন্তা করলাম? (The Thought Process)

1. **Turborepo ডিপেন্ডেন্সি গ্রাফ ঠিক করা**:
   - `build`, `lint`, `typecheck`, `test:unit` সবগুলো টাস্কের আগে `^proto:generate` ডিপেন্ডেন্সি যোগ করা।
   - ডাটাবেজ সম্পর্কিত টাস্কে `"cache": false` যুক্ত করা।
2. **GitHub Actions CI ওয়ার্কফ্লো তৈরি করা**:
   - `.github/workflows/ci.yml` তৈরি করে এমনভাবে কনফিগার করা যেন পুশ বা পিআর হলেই ধাপে ধাপে: ডিপেন্ডেন্সি ইনস্টল -> প্রোটো জেনারেট -> লিন্ট -> টাইপচেক -> ইউনিট টেস্ট -> প্রোডাকশন বিল্ড যাচাই করে।
3. **প্রি-কমিট কোয়ালিটি গার্ড**:
   - `.husky/pre-commit` হুক দিয়ে লোকালি কমিট করার আগেই Biome ফরম্যাট ও লিন্ট চেক নিশ্চিত করা।
4. **সহজ সেটআপ গাইড**:
   - যেকোনো নতুন ডেভেলপার যেন ২ মিনিটের মধ্যে পুরো প্রজেক্ট রান করতে পারে সেজন্য ৫০ লাইনের নিচে একটি টু-দ্য-পয়েন্ট `SETUP.md` তৈরি করা।

---

## ৩. কী কী ফাইল কনফিগার করা হলো?

### ১. আপগ্রেডেড `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "proto:generate": {
      "outputs": ["generated/**"]
    },
    "build": {
      "dependsOn": ["^proto:generate", "^build"],
      "outputs": ["dist/**", ".output/**", ".vinxi/**", ".tanstack/**", "generated/**"]
    },
    "lint": {
      "dependsOn": ["^proto:generate", "^build"]
    },
    "typecheck": {
      "dependsOn": ["^proto:generate", "^build"]
    },
    "test:unit": {
      "dependsOn": ["^proto:generate", "^build"],
      "outputs": ["coverage/**"]
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    }
  }
}
```

### ২. GitHub Actions CI পাইপলাইন (`.github/workflows/ci.yml`)
- `push` এবং `pull_request` ইভেন্টে স্বয়ংক্রিয়ভাবে রান হয়।
- নোড ভার্সন ২০ এবং pnpm ক্যাশিং দিয়ে দ্রুততম সময়ে সম্পূর্ণ ভ্যালিডেশন নিশ্চিত করে।

### ৩. ডেভেলপার সেটআপ রানবুক (`SETUP.md`)
- `pnpm install` -> `pnpm run proto:generate` -> `pnpm run db:migrate && pnpm run db:seed` -> `pnpm run dev` মাত্র ৪টি স্টেপে যেকোনো প্ল্যাটফর্মে অ্যাপ চালু করার স্পষ্ট নির্দেশনা।

---

## ৪. ফলাফল কী হলো?
- সম্পূর্ণ মোনোরিপো টার্বোরিপোর সর্বোচ্চ গতিতে প্যারালাল বিল্ড সম্পন্ন করে (`FULL TURBO`).
- কোনো ভুল কোড বা ব্রোকেন টেস্ট থাকলে তা গিথাব CI স্বয়ংক্রিয়ভাবে ব্লক করে দেবে।
