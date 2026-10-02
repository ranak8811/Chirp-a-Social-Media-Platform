# Issue 1: পাসওয়ার্ড সিকিউরিটি ও অথেনটিকেশন ট্রাস্ট (Credentials & Trust)

## ১. সমস্যা কী ছিল? (সহজ ভাষায়)

### সমস্যা ক: দুর্বল পাসওয়ার্ড হ্যাশিং (Weak Password Hashing)
- কোডবেসে পাসওয়ার্ড সুরক্ষিত করার জন্য সাধারণ `SHA-256` হ্যাশিং ব্যবহার করা হচ্ছিল এবং সেখানে একটি ফিক্সড শব্দ `"salt"` জুড়ে দেওয়া হতো:
  ```typescript
  // আগে যা ছিল:
  function hashPassword(password: string): string {
      const hash = createHash("sha256");
      hash.update(password + "salt"); // সবার জন্য একই সল্ট!
      return hash.digest("hex");
  }
  ```
- **কেন এটি মারাত্মক বিপজ্জনক?**
  1. **SHA-256 খুব দ্রুত রান করে**: কোনো হ্যাকার ডাটাবেজ চুরি করলে সাধারণ গ্রাফিক্স কার্ড (GPU) দিয়ে প্রতি সেকেন্ডে কোটি কোটি পাসওয়ার্ড গেস করতে পারে (Brute Force)।
  2. **স্ট্যাটিক সল্ট (Static Salt)**: সবার জন্য `"salt"` ফিক্সড থাকায় হ্যাকার রেইনবো টেবিল (Rainbow Table) দিয়ে এক নিমিষে পাসওয়ার্ড বের করে ফেলতে পারে।

### সমস্যা খ: ফেক ট্রাস্ট ও ক্লায়েন্ট টোকেন তৈরি (Fake Trust)
- আসল নিয়মে টোকেন তৈরি করবে শুধু কেন্দ্রীয় ব্যাকএন্ড সার্ভার (API)।
- কিন্তু আগে যা হচ্ছিল: ক্লায়েন্ট অ্যাপ (React ফ্রন্টএন্ড) ব্যাকএন্ডকে জিজ্ঞাসা না করেই নিজে নিজে `jwt.sign(...)` দিয়ে টোকেন বানিয়ে লোকালস্টোরেজে রেখে দিচ্ছিল! এটা হলো সিকিউরিটির চরম লঙ্ঘন।

---

## ২. আমরা কীভাবে চিন্তা করলাম? (The Thought Process)

1. **মেমোরি-হার্ড অ্যালগরিদম দরকার**: পাসওয়ার্ড হ্যাশিং এমন হতে হবে যা করতে কম্পিউটারের প্রচুর RAM ও CPU টাইম লাগে (যেমন `scrypt` বা `bcrypt`), যাতে হ্যাকাররা প্যারালাল ব্রুট-ফোর্স করতে না পারে।
2. **প্রত্যেক ইউজারের আলাদা সল্ট**: প্রতিবার হ্যাশ করার সময় ১৬ বাইটের ইউনিক র‍্যান্ডম সল্ট (`crypto.randomBytes(16)`) তৈরি করতে হবে।
3. **পুরানো ইউজারদের অ্যাকাউন্ট নষ্ট করা যাবে না (Zero Downtime Migration)**:
   - ডাটাবেজে আগের ইউজারদের পাসওয়ার্ড SHA-256 তে আছে।
   - যদি আমরা একবারে সব বদলে দেই, আগের ইউজাররা লগইন করতে পারবে না।
   - **বুদ্ধিমান সমাধান**: যখন কোনো ইউজার লগইন করবে, আমরা চেক করবো তার পাসওয়ার্ড কি পুরানো ফরম্যাটে নাকি নতুন ফরম্যাটে? যদি পুরানো ফরম্যাটে ভেরিফাই সফল হয়, আমরা তখনই ব্যাকগ্রাউন্ডে তাকে নতুন `scrypt` এ কনভার্ট করে ডাটাবেজ আপডেট করে দিব! একে বলে **Transparent On-the-fly Migration**।
4. **API হবে একমাত্র টোকেন জেনারেটর**: ফ্রন্টএন্ড নিজে টোকেন বানাবে না। ব্যাকএন্ডের `login` এবং `register` থেকে API-এর সিক্রেট দিয়ে জেনারেট হওয়া আসল টোকেন আসবে এবং ফ্রন্টএন্ড সেটা স্টোর করবে।

---

## ৩. ধাপে ধাপে আমরা কীভাবে কোড লিখলাম? (Step-by-Step Implementation)

### ধাপ ১: `apps/api/src/services/utils.ts` এ Scrypt তৈরি
আমরা Node.js এর ইন-বিল্ট `crypto.scrypt` ব্যবহার করে স্ট্যান্ডার্ড ফরম্যাট তৈরি করলাম:
```typescript
const SCRYPT_PREFIX = "scrypt";
const SCRYPT_COST = 16384; // N = 16384 (মেমোরি কস্ট)
const SCRYPT_BLOCK_SIZE = 8; // r = 8
const SCRYPT_PARALLELIZATION = 1; // p = 1
const SCRYPT_KEYLEN = 64; // 64 বাইট কি

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
    });
    // ফরম্যাট: scrypt$16384$8$1$salt$hash
    return `${SCRYPT_PREFIX}$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derivedKey.toString("hex")}`;
}
```

### ধাপ ২: ডুয়াল-মোড পাসওয়ার্ড ভেরিফিকেশন ও ট্র্যান্সপারেন্ট রি-হ্যাশিং
`apps/api/src/services/auth.service.ts` এ:
```typescript
export async function loginUser(input: LoginInput) {
    const user = await db.select().from(users).where(eq(users.email, input.email)).get();
    if (!user) throw new Error("Invalid credentials");

    // পাসওয়ার্ড ভেরিফাই (নতুন scrypt অথবা পুরানো sha256 দুইটাই চেক করবে)
    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) throw new Error("Invalid credentials");

    // যদি পুরানো sha256 ফরম্যাট থাকে, সাথে সাথে নতুন scrypt এ মাইগ্রেট করে ডাটাবেজ আপডেট করো!
    if (!user.passwordHash.startsWith("scrypt$")) {
        const newHash = await hashPassword(input.password);
        await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
    }

    // ব্যাকএন্ড থেকে সাইন করা অফিসিয়াল টোকেন রিটার্ন করো
    const token = generateSessionToken({ userId: user.id, username: user.username, role: user.role });
    return { token, user };
}
```

### ধাপ ৩: ফ্রন্টএন্ডে ব্যাকএন্ডের টোকেন সেভ করা
`apps/client-user` এবং `apps/client-admin` এ ফ্রন্টএন্ড থেকে নিজে নিজে ফেক টোকেন তৈরি বন্ধ করে দিয়ে ব্যাকএন্ডের রেসপন্স থেকে আসা `response.token` কে সেশনে সেভ করা হলো।

---

## ৪. ফলাফল কী হলো?
1. পাসওয়ার্ড এখন এনটারপ্রাইজ-গ্রেড মেমোরি-হার্ড সিকিউরড।
2. আগের কোনো ইউজারের অ্যাকাউন্ট নষ্ট হয়নি, লগইন করলেই অটোমেটিক আপগ্রেড হয়ে গেছে।
3. ক্লায়েন্ট অ্যাপ এবং ব্যাকএন্ডের মধ্যে খাঁটি ক্রিপ্টোগ্রাফিক ট্রাস্ট প্রতিষ্ঠিত হয়েছে।
