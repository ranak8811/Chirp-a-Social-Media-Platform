# Issue 3: এরর হ্যান্ডলিং ও অবজারভেবিলিটি (Error Handling & Observability)

## ১. সমস্যা কী ছিল? (সহজ ভাষায়)

### সমস্যা ক: অপরিকল্পিত এরর ও ভুল gRPC কোড
- আগে সার্ভারের বিভিন্ন জায়গায় যে যার মতো `throw new Error("User not found")` অথবা `throw new Error("Invalid password")` লিখে দিত।
- এতে সমস্যা হলো:
  1. gRPC ক্লায়েন্ট বুঝতে পারতো না এটা কি `NOT_FOUND` (404), নাকি `UNAUTHENTICATED` (401), নাকি `INTERNAL_ERROR` (500)।
  2. সিকিউরিটি রিস্ক: ডাটাবেজের কাঁচা এরর বা ইন্টারনাল ফাইলপাথ ফ্রন্টএন্ডে এক্সপোজ হয়ে যেত।

### সমস্যা খ: রিকোয়েস্ট ট্রেসিং ও লগিংয়ের অভাব
- প্রোডাকশনে যখন কোনো ইউজার বলে `"আমার রিকোয়েস্ট ফেইল করেছে"`, ইঞ্জিনিয়ারদের লগ দেখে বোঝার কোনো উপায় ছিল না কোন লগের মেসেজটি ওই ইউজারের রিকোয়েস্টের ছিল।
- লগগুলো ছিল সাধারণ টেক্সট (যেমন `console.log("doing something")`), যা কোনো লগ অ্যানালাইজার টুল (যেমন Datadog / CloudWatch / Grafana) ফিল্টার বা সার্চ করতে পারতো না।

---

## ২. আমরা কীভাবে চিন্তা করলাম? (The Thought Process)

1. **ইউনিফায়েড এরর ট্যাক্সোনমি (Unified Error Taxonomy)**:
   - একটি স্ট্যান্ডার্ড `AppError` বেস ক্লাস বানাবো।
   - সেখান থেকে স্পেসিফিক ক্লাস থাকবে: `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `InternalServerError`।
   - প্রতিটির সাথে নির্দিষ্ট gRPC স্ট্যাটাস কোড (যেমন `Status.NOT_FOUND`, `Status.UNAUTHENTICATED`) এবং HTTP কোড ম্যাপ করা থাকবে।
2. **প্রতিটি রিকোয়েস্টে ইউনিক Trace ID (`x-trace-id`)**:
   - যখনই সার্ভারে কোনো রিকোয়েস্ট ঢুকবে, আমরা তাকে একটি ইউনিক ট্র্যাকিং আইডি দেব (যেমন `req_1727850000000_abc123`)।
   - এই আইডি রিকোয়েস্টের শুরুতে তৈরি হবে এবং রেসপন্স হেডার ও ট্রেইলারে (`x-trace-id`) ক্লায়েন্টকে ফেরত পাঠানো হবে।
   - Node.js এর `AsyncLocalStorage` ব্যবহার করবো, যাতে কোডের যেকোনো ফাংশনের ভেতর প্যারামিটার পাস না করেও স্বয়ংক্রিয়ভাবে বর্তমান Trace ID পাওয়া যায়।
3. **স্ট্রাকচার্ড JSON লগিং**:
   - সাধারণ `console.log` এর বদলে JSON ফরম্যাটে লগ প্রিন্ট হবে, যাতে প্রতি লগে `traceId`, `timestamp`, `level`, `service`, `method`, `durationMs` স্বয়ংক্রিয়ভাবে জুড়ে যায়।
4. **নন-ব্রেকিং ইন্টারসেপ্টর প্যাটার্ন (Service Wrapper)**:
   - বিদ্যমান সার্ভিসগুলোর কোড না ভেঙে একটি সেন্ট্রাল র‍্যাপার দিয়ে gRPC মেথডগুলোকে র‍্যাপ করবো।

---

## ৩. ধাপে ধাপে আমরা কীভাবে কোড লিখলাম? (Implementation)

### ধাপ ১: `apps/api/src/errors/index.ts` এ এরর ট্যাক্সোনমি তৈরি
```typescript
export class AppError extends Error {
    constructor(
        message: string,
        public code: string = "INTERNAL_ERROR",
        public grpcCode: number = Status.INTERNAL,
        public statusCode: number = 500,
        public details?: any,
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found", details?: any) {
        super(message, "NOT_FOUND", Status.NOT_FOUND, 404, details);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized", details?: any) {
        super(message, "UNAUTHORIZED", Status.UNAUTHENTICATED, 401, details);
    }
}
```

### ধাপ ২: `AsyncLocalStorage` দিয়ে রিকোয়েস্ট ট্রেসিং (`trace.ts`)
```typescript
import { AsyncLocalStorage } from "node:async_hooks";

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

export function runWithTrace<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
    return asyncLocalStorage.run(context, fn);
}

export function getCurrentTrace(): TraceContext | undefined {
    return asyncLocalStorage.getStore();
}
```

### ধাপ ৩: স্ট্রাকচার্ড লগার (`logger.ts`)
```typescript
function log(level: "info" | "warn" | "error", message: string, meta: Record<string, any> = {}) {
    const trace = getCurrentTrace();
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        traceId: trace?.traceId || "no-trace",
        service: trace?.service,
        method: trace?.method,
        message,
        ...meta,
    };
    console.log(JSON.stringify(payload));
}
```

### ধাপ ৪: gRPC সার্ভিসগুলোকে স্বয়ংক্রিয়ভাবে ইন্টারসেপ্ট করা (`interceptor.ts`)
`apps/api/src/grpc/server.ts` এ সব সার্ভিসকে `wrapServiceWithObservability(serviceName, impl)` দিয়ে র‍্যাপ করা হলো। ফলে কোনো হ্যান্ডলারে আলাদা কোড না লিখেও সব রিকোয়েস্ট স্বয়ংক্রিয়ভাবে ট্রেস ও লগ হওয়া শুরু করলো।

---

## ৪. ফলাফল কী হলো?
- যেকোনো এরর ঘটলে সঠিক gRPC কোড ও পরিষ্কার মেসেজ পাওয়া যায়।
- প্রোডাকশনে যেকোনো বাগ বা এরর ঘটলে রেসপন্সের `x-trace-id` দিয়ে সার্চ করলেই পুরো রিকোয়েস্টের শুরু থেকে শেষ পর্যন্ত এক্সাক্ট লগ বের করে ফেলা যায়।
